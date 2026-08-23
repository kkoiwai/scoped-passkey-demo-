package com.example.mycredman.provisioning

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun PasskeyProvisioningScreen(
    uiState: ProvisioningUiState,
    onStartProvisioning: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer
            ),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "🔑 Passkey Provisioning",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "OAuth 2.0 (Auth Tab) 認可フローで取得したトークンを使用し、Tim Cappalli 仕様に準拠した Passkey Provisioning API からパスキーを発行・登録します。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.85f)
                )
            }
        }

        // Configuration Overview Card (Build-time config)
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text(
                    text = "⚙️ 設定情報 (AuthConfig)",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
                ConfigItem(label = "Auth Endpoint", value = AuthConfig.AUTHORIZATION_ENDPOINT)
                ConfigItem(label = "Token Endpoint", value = AuthConfig.TOKEN_ENDPOINT)
                ConfigItem(label = "Options Endpoint", value = AuthConfig.CREATION_OPTIONS_ENDPOINT)
                ConfigItem(label = "Register Endpoint", value = AuthConfig.REGISTER_ENDPOINT)
                ConfigItem(label = "Client ID", value = AuthConfig.CLIENT_ID)
                ConfigItem(label = "Redirect URI", value = AuthConfig.REDIRECT_URI)
            }
        }

        // Stepper Progress Display
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "処理フロー進捗",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(12.dp))

                val currentStepNumber = when (uiState) {
                    is ProvisioningUiState.InProgress -> uiState.step.stepNumber
                    is ProvisioningUiState.Success -> 6
                    else -> 0
                }

                StepIndicatorRow(
                    stepNumber = 1,
                    title = "OAuth 認可",
                    sub = "AuthTabIntent (PKCE S256)",
                    currentStep = currentStepNumber,
                    isError = uiState is ProvisioningUiState.Error && currentStepNumber <= 1
                )
                StepIndicatorRow(
                    stepNumber = 2,
                    title = "トークン交換",
                    sub = "POST /oauth/token (code_verifier)",
                    currentStep = currentStepNumber,
                    isError = uiState is ProvisioningUiState.Error && currentStepNumber == 2
                )
                StepIndicatorRow(
                    stepNumber = 3,
                    title = "Options 取得",
                    sub = "POST /passkeys/creation-options",
                    currentStep = currentStepNumber,
                    isError = uiState is ProvisioningUiState.Error && currentStepNumber == 3
                )
                StepIndicatorRow(
                    stepNumber = 4,
                    title = "パスキー生成",
                    sub = "CredentialManager (生体認証/画面ロック)",
                    currentStep = currentStepNumber,
                    isError = uiState is ProvisioningUiState.Error && currentStepNumber == 4
                )
                StepIndicatorRow(
                    stepNumber = 5,
                    title = "公開鍵登録",
                    sub = "POST /passkeys/register",
                    currentStep = currentStepNumber,
                    isError = uiState is ProvisioningUiState.Error && currentStepNumber == 5,
                    isLast = true
                )
            }
        }

        // Action Buttons & Live Status
        when (uiState) {
            is ProvisioningUiState.Idle -> {
                Button(
                    onClick = onStartProvisioning,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = "OAuth 認証してパスキーを発行",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            is ProvisioningUiState.InProgress -> {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(28.dp),
                            strokeWidth = 3.dp,
                            color = MaterialTheme.colorScheme.onSecondaryContainer
                        )
                        Spacer(modifier = Modifier.width(16.dp))
                        Column {
                            Text(
                                text = "Step ${uiState.step.stepNumber}: ${uiState.step.title}",
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSecondaryContainer
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = uiState.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.85f)
                            )
                        }
                    }
                }
            }

            is ProvisioningUiState.Success -> {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = Color(0xFFE8F5E9)
                    ),
                    shape = RoundedCornerShape(12.dp),
                    border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(Color(0xFF2E7D32)))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(text = "✅", fontSize = 24.sp)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = uiState.message,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF1B5E20),
                                fontSize = 16.sp
                            )
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        JsonPayloadPreview(title = "Access Token", content = uiState.accessToken)
                        JsonPayloadPreview(title = "Creation Options JSON", content = uiState.creationOptionsJson)
                        JsonPayloadPreview(title = "Registration Response JSON", content = uiState.registrationResponseJson)
                        JsonPayloadPreview(title = "Server Response", content = uiState.serverResponseJson)

                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = onReset,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                        ) {
                            Text("もう一度実行する")
                        }
                    }
                }
            }

            is ProvisioningUiState.Error -> {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "⚠️ エラーが発生しました [${uiState.step}]",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = uiState.message,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        if (!uiState.details.isNullOrEmpty()) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "詳細: ${uiState.details}",
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.8f)
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(
                                onClick = onStartProvisioning,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.error
                                )
                            ) {
                                Text("再試行")
                            }
                            OutlinedButton(onClick = onReset) {
                                Text("リセット")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ConfigItem(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun StepIndicatorRow(
    stepNumber: Int,
    title: String,
    sub: String,
    currentStep: Int,
    isError: Boolean = false,
    isLast: Boolean = false
) {
    val (statusColor, badgeText) = when {
        isError -> Pair(MaterialTheme.colorScheme.error, "✕")
        currentStep > stepNumber -> Pair(Color(0xFF2E7D32), "✓")
        currentStep == stepNumber -> Pair(MaterialTheme.colorScheme.primary, "$stepNumber")
        else -> Pair(Color.Gray, "$stepNumber")
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(statusColor),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = badgeText,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (currentStep == stepNumber) FontWeight.Bold else FontWeight.Normal,
                color = if (currentStep >= stepNumber) MaterialTheme.colorScheme.onSurface else Color.Gray
            )
            Text(
                text = sub,
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray,
                fontSize = 11.sp
            )
        }
    }
}

@Composable
private fun JsonPayloadPreview(title: String, content: String) {
    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFFF1F8E9)
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1B5E20)
                )
                OutlinedButton(
                    onClick = { expanded = !expanded },
                    modifier = Modifier.height(28.dp),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = if (expanded) "閉じる" else "詳細表示",
                        fontSize = 10.sp
                    )
                }
            }

            AnimatedVisibility(visible = expanded) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 6.dp),
                    color = Color(0xFF263238),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = content,
                        color = Color(0xFFECEFF1),
                        fontFamily = FontFamily.Monospace,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            }
        }
    }
}
