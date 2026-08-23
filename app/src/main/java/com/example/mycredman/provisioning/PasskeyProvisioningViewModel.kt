package com.example.mycredman.provisioning

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import androidx.browser.auth.AuthTabIntent
import androidx.browser.auth.ExperimentalAuthTab
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialCustomException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * UI State representing the progression of the Passkey Provisioning Flow.
 */
sealed interface ProvisioningUiState {
    object Idle : ProvisioningUiState

    data class InProgress(
        val step: Step,
        val description: String,
        val accessToken: String? = null,
        val creationOptionsJson: String? = null,
        val registrationResponseJson: String? = null
    ) : ProvisioningUiState {
        enum class Step(val stepNumber: Int, val title: String) {
            OAUTH_AUTHORIZING(1, "OAuth 認可 (Auth Tab)"),
            TOKEN_EXCHANGE(2, "トークン交換 (Token Exchange)"),
            FETCHING_OPTIONS(3, "Creation Options 取得"),
            CREATING_PASSKEY(4, "パスキー生成 (Credential Manager)"),
            REGISTERING_PASSKEY(5, "パスキー登録 (Register API)")
        }
    }

    data class Success(
        val accessToken: String,
        val creationOptionsJson: String,
        val registrationResponseJson: String,
        val serverResponseJson: String,
        val message: String = "パスキーの発行と登録が正常に完了しました！"
    ) : ProvisioningUiState

    data class Error(
        val step: String,
        val message: String,
        val details: String? = null
    ) : ProvisioningUiState
}

/**
 * ViewModel orchestrating the entire OAuth 2.0 Auth Tab and Passkey Provisioning workflow.
 */
@OptIn(ExperimentalAuthTab::class)
class PasskeyProvisioningViewModel(
    private val authTabManager: OAuthAuthTabManager = OAuthAuthTabManager(),
    private val provisioningClient: PasskeyProvisioningClient = PasskeyProvisioningClient()
) : ViewModel() {

    companion object {
        private const val TAG = "PasskeyProvViewModel"
    }

    private val _uiState = MutableStateFlow<ProvisioningUiState>(ProvisioningUiState.Idle)
    val uiState: StateFlow<ProvisioningUiState> = _uiState.asStateFlow()

    private var currentAccessToken: String? = null

    /**
     * Starts the Provisioning flow by opening the Auth Tab for OAuth 2.0 PKCE authentication.
     */
    fun startProvisioning(launcher: ActivityResultLauncher<Intent>) {
        _uiState.value = ProvisioningUiState.InProgress(
            step = ProvisioningUiState.InProgress.Step.OAUTH_AUTHORIZING,
            description = "Auth Tab で IdP 認可画面を起動しています..."
        )

        authTabManager.launchAuthTab(launcher)
            .onFailure { error ->
                Log.e(TAG, "Failed to launch Auth Tab", error)
                _uiState.value = ProvisioningUiState.Error(
                    step = "OAuth 認可 (Auth Tab)",
                    message = "Auth Tab の起動に失敗しました。",
                    details = error.localizedMessage
                )
            }
    }

    /**
     * Handles the callback from Auth Tab via ActivityResultLauncher.
     */
    fun handleAuthTabCallback(activityContext: Context, result: AuthTabIntent.AuthResult) {
        val parseResult = authTabManager.handleAuthTabResult(result)
        parseResult.onSuccess { (code, codeVerifier) ->
            exchangeTokenAndProceed(activityContext, code, codeVerifier)
        }.onFailure { error ->
            Log.e(TAG, "Auth Tab authentication failed or was cancelled", error)
            val errorMessage = when (error) {
                is OAuthAuthTabManager.UserCancelledException -> "ユーザーによって認可がキャンセルされました。"
                else -> "認可エラー: ${error.localizedMessage}"
            }
            _uiState.value = ProvisioningUiState.Error(
                step = "OAuth 認可 (Auth Tab)",
                message = errorMessage,
                details = error.localizedMessage
            )
        }
    }

    /**
     * Handles redirect URI received via Intent filter fallback.
     */
    fun handleRedirectUri(activityContext: Context, uri: android.net.Uri) {
        val parseResult = authTabManager.handleRedirectUri(uri)
        parseResult.onSuccess { (code, codeVerifier) ->
            exchangeTokenAndProceed(activityContext, code, codeVerifier)
        }.onFailure { error ->
            Log.e(TAG, "Redirect URI parsing failed", error)
            _uiState.value = ProvisioningUiState.Error(
                step = "OAuth 認可 (Redirect)",
                message = "認可リダイレクトの解析に失敗しました。",
                details = error.localizedMessage
            )
        }
    }

    /**
     * Step 2: Exchanges authorization code for access token, then fetches Creation Options.
     */
    private fun exchangeTokenAndProceed(activityContext: Context, code: String, codeVerifier: String) {
        viewModelScope.launch {
            _uiState.value = ProvisioningUiState.InProgress(
                step = ProvisioningUiState.InProgress.Step.TOKEN_EXCHANGE,
                description = "認可コードをアクセストークンと交換しています..."
            )

            val tokenResult = provisioningClient.exchangeCodeForToken(
                tokenEndpoint = AuthConfig.TOKEN_ENDPOINT,
                code = code,
                codeVerifier = codeVerifier,
                clientId = AuthConfig.CLIENT_ID,
                redirectUri = AuthConfig.REDIRECT_URI
            )

            tokenResult.onSuccess { tokenResponse ->
                val accessToken = tokenResponse.accessToken
                currentAccessToken = accessToken
                fetchCreationOptionsAndCreatePasskey(activityContext, accessToken)
            }.onFailure { error ->
                Log.e(TAG, "Token exchange failed", error)
                _uiState.value = ProvisioningUiState.Error(
                    step = "トークン交換 (Token Exchange)",
                    message = "アクセストークンの取得に失敗しました。",
                    details = error.localizedMessage
                )
            }
        }
    }

    /**
     * Step 3 & 4: Fetches PublicKeyCredentialCreationOptions JSON and triggers CredentialManager.
     */
    private fun fetchCreationOptionsAndCreatePasskey(activityContext: Context, accessToken: String) {
        viewModelScope.launch {
            _uiState.value = ProvisioningUiState.InProgress(
                step = ProvisioningUiState.InProgress.Step.FETCHING_OPTIONS,
                description = "Passkey Provisioning API から Creation Options を取得中...",
                accessToken = accessToken
            )

            val optionsResult = provisioningClient.fetchCreationOptions(
                creationOptionsEndpoint = AuthConfig.CREATION_OPTIONS_ENDPOINT,
                accessToken = accessToken
            )

            optionsResult.onSuccess { creationOptionsJson ->
                createPasskeyDirectly(activityContext, accessToken, creationOptionsJson)
            }.onFailure { error ->
                Log.e(TAG, "Failed to fetch creation options", error)
                _uiState.value = ProvisioningUiState.Error(
                    step = "Creation Options 取得",
                    message = "パスキー生成オプションの取得に失敗しました。",
                    details = error.localizedMessage
                )
            }
        }
    }

    /**
     * Step 4: Generates passkey directly in this app's storage (MyCredentialDataManager)
     * without calling the OS Credential Manager API.
     */
    private fun createPasskeyDirectly(
        activityContext: Context,
        accessToken: String,
        creationOptionsJson: String
    ) {
        viewModelScope.launch {
            _uiState.value = ProvisioningUiState.InProgress(
                step = ProvisioningUiState.InProgress.Step.CREATING_PASSKEY,
                description = "自アプリのパスキー保管庫に鍵を生成・保存中...",
                accessToken = accessToken,
                creationOptionsJson = creationOptionsJson
            )

            try {
                val registrationResponseJson = DirectPasskeyCreator.createAndSavePasskey(
                    context = activityContext,
                    creationOptionsJson = creationOptionsJson
                )

                registerPasskeyWithServer(accessToken, creationOptionsJson, registrationResponseJson)
            } catch (e: Exception) {
                Log.e(TAG, "Direct passkey creation failed", e)
                _uiState.value = ProvisioningUiState.Error(
                    step = "パスキー生成 (自アプリ保管庫)",
                    message = "パスキーの生成・保存に失敗しました。",
                    details = e.localizedMessage
                )
            }
        }
    }

    /**
     * Step 5: Registers the created passkey with the Passkey Provisioning API.
     */
    private fun registerPasskeyWithServer(
        accessToken: String,
        creationOptionsJson: String,
        registrationResponseJson: String
    ) {
        viewModelScope.launch {
            _uiState.value = ProvisioningUiState.InProgress(
                step = ProvisioningUiState.InProgress.Step.REGISTERING_PASSKEY,
                description = "公開鍵と登録データをサーバーへ送信中...",
                accessToken = accessToken,
                creationOptionsJson = creationOptionsJson,
                registrationResponseJson = registrationResponseJson
            )

            val registerResult = provisioningClient.registerPasskey(
                registerEndpoint = AuthConfig.REGISTER_ENDPOINT,
                accessToken = accessToken,
                registrationResponseJson = registrationResponseJson
            )

            registerResult.onSuccess { serverResponseJson ->
                _uiState.value = ProvisioningUiState.Success(
                    accessToken = accessToken,
                    creationOptionsJson = creationOptionsJson,
                    registrationResponseJson = registrationResponseJson,
                    serverResponseJson = serverResponseJson
                )
            }.onFailure { error ->
                Log.e(TAG, "Passkey registration API failed", error)
                _uiState.value = ProvisioningUiState.Error(
                    step = "パスキー登録 (Register API)",
                    message = "サーバーへのパスキー登録に失敗しました。",
                    details = error.localizedMessage
                )
            }
        }
    }

    /**
     * Resets the flow back to Idle state.
     */
    fun resetState() {
        _uiState.value = ProvisioningUiState.Idle
    }
}
