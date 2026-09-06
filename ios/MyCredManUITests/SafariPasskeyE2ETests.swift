import XCTest

final class SafariPasskeyE2ETests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
        ensureAutoFillSettings()
    }

    private func ensureAutoFillSettings() {
        print("[UITest] Ensuring AutoFill settings: My CredMan ON...")
        let myApp = XCUIApplication(bundleIdentifier: "com.exarnp1e.mycredman")
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        let sb = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        
        myApp.launch()
        let settingsBtn = myApp.buttons["設定を開く"]
        if settingsBtn.waitForExistence(timeout: 5) {
            settingsBtn.tap()
        } else {
            settings.launch()
        }
        
        _ = settings.wait(for: .runningForeground, timeout: 5)
        Thread.sleep(forTimeInterval: 2.0)
        
        print("[UITest] Settings debug description:\n\(settings.debugDescription)")
        
        // Find My CredMan switch dynamically
        let credManSwitch = settings.switches.matching(NSPredicate(format: "label CONTAINS[c] %@", "My CredMan")).firstMatch
        let credManCell = settings.cells.matching(NSPredicate(format: "label CONTAINS[c] %@", "My CredMan")).firstMatch
        
        var needsTap = true
        if credManSwitch.exists {
            let inner = credManSwitch.switches.firstMatch
            let val = (inner.exists ? (inner.value as? String) : (credManSwitch.value as? String)) ?? ""
            print("[UITest] Found My CredMan switch directly: label='\(credManSwitch.label)', value='\(val)'")
            if val == "1" {
                print("[UITest] My CredMan switch is ALREADY ON! No toggle needed.")
                needsTap = false
            }
        } else if credManCell.exists {
            let cellSwitch = credManCell.switches.firstMatch
            let val = (cellSwitch.value as? String) ?? ""
            print("[UITest] Found My CredMan cell switch: value='\(val)'")
            if val == "1" {
                print("[UITest] My CredMan cell switch is ALREADY ON! No toggle needed.")
                needsTap = false
            }
        }
        
        if needsTap {
            print("[UITest] Tapping My CredMan toggle switch...")
            if credManSwitch.exists {
                let inner = credManSwitch.switches.firstMatch
                if inner.exists && inner.isHittable {
                    print("[UITest] Tapping inner UISwitch directly: frame=\(inner.frame)")
                    inner.tap()
                } else {
                    print("[UITest] Tapping right-side coordinate of credManSwitch (offset 0.88, 0.5)...")
                    credManSwitch.coordinate(withNormalizedOffset: CGVector(dx: 0.88, dy: 0.5)).tap()
                }
            } else if credManCell.exists {
                let inner = credManCell.switches.firstMatch
                if inner.exists && inner.isHittable {
                    inner.tap()
                } else {
                    credManCell.coordinate(withNormalizedOffset: CGVector(dx: 0.88, dy: 0.5)).tap()
                }
            }
            Thread.sleep(forTimeInterval: 1.5)
            handleSettingsAlert(settings: settings, sb: sb)
            
            Thread.sleep(forTimeInterval: 1.5)
            if credManSwitch.exists {
                let inner = credManSwitch.switches.firstMatch
                let finalVal = (inner.exists ? (inner.value as? String) : (credManSwitch.value as? String)) ?? ""
                print("[UITest] Verified My CredMan switch value after toggle: '\(finalVal)'")
                if finalVal != "1" {
                    print("[UITest] Switch not ON yet, retrying right-side coordinate tap...")
                    credManSwitch.coordinate(withNormalizedOffset: CGVector(dx: 0.88, dy: 0.5)).tap()
                    Thread.sleep(forTimeInterval: 1.5)
                    handleSettingsAlert(settings: settings, sb: sb)
                }
            }
        }
        
        saveScreenshot(name: "settings_after_configuration")
    }
    
    private func handleSettingsAlert(settings: XCUIApplication, sb: XCUIApplication) {
        let confirmTargets = ["Turn On", "オンにする", "Use", "使用", "OK", "続ける", "Continue"]
        if settings.alerts.count > 0 {
            let alert = settings.alerts.firstMatch
            print("[UITest] Settings alert detected: \(alert.label)")
            for target in confirmTargets {
                let btn = alert.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", target)).firstMatch
                if btn.exists && btn.isHittable {
                    print("[UITest] Tapping alert button: '\(btn.label)'")
                    btn.tap()
                    return
                }
            }
            if alert.buttons.count > 1 {
                let lastBtn = alert.buttons.element(boundBy: alert.buttons.count - 1)
                print("[UITest] Tapping last alert button: '\(lastBtn.label)'")
                lastBtn.tap()
            }
        } else if sb.alerts.count > 0 {
            let alert = sb.alerts.firstMatch
            print("[UITest] SpringBoard alert detected: \(alert.label)")
            for target in confirmTargets {
                let btn = alert.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", target)).firstMatch
                if btn.exists && btn.isHittable {
                    print("[UITest] Tapping SpringBoard alert button: '\(btn.label)'")
                    btn.tap()
                    return
                }
            }
            if alert.buttons.count > 1 {
                let lastBtn = alert.buttons.element(boundBy: alert.buttons.count - 1)
                lastBtn.tap()
            }
        }
    }

    func testPasskeyFullFlowInSafari() throws {
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        
        safari.launch()
        Thread.sleep(forTimeInterval: 1.5)
        
        // Handle Tab Overview if Safari is in tab overview mode
        let isInTabOverview = safari.textViews["TabOverview"].exists ||
                              safari.otherElements["TabOverview"].exists ||
                              safari.buttons["DoneButton"].exists ||
                              safari.buttons["Done"].exists
        if isInTabOverview {
            print("[UITest] Safari is in Tab Overview mode")
            let existingTab = safari.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Scoped Passkey")).firstMatch
            if existingTab.exists {
                if !existingTab.isHittable {
                    print("[UITest] Swiping down in Tab Overview to bring Scoped Passkey tab into view...")
                    safari.swipeDown()
                    Thread.sleep(forTimeInterval: 1.0)
                }
                if existingTab.isHittable {
                    print("[UITest] Tapping existing Scoped Passkey tab...")
                    existingTab.tap()
                    Thread.sleep(forTimeInterval: 1.5)
                }
            }
            
            // If still in Tab Overview, tap DoneButton to enter active tab
            let doneBtn = safari.buttons["DoneButton"].exists ? safari.buttons["DoneButton"] : safari.buttons["Done"]
            if (safari.textViews["TabOverview"].exists || safari.buttons["DoneButton"].exists || safari.buttons["Done"].exists) && doneBtn.exists && doneBtn.isHittable {
                print("[UITest] Tapping Done button in Tab Overview...")
                doneBtn.tap()
                Thread.sleep(forTimeInterval: 1.5)
            }
        }
        
        let webView = safari.webViews.firstMatch
        if !webView.waitForExistence(timeout: 5) {
            let doneBtn = safari.buttons["DoneButton"].exists ? safari.buttons["DoneButton"] : safari.buttons["Done"]
            if doneBtn.exists && doneBtn.isHittable {
                doneBtn.tap()
            } else if safari.buttons["NewTabButton"].exists && safari.buttons["NewTabButton"].isHittable {
                safari.buttons["NewTabButton"].tap()
            }
        }
        XCTAssertTrue(webView.waitForExistence(timeout: 10), "Safari webview should be visible")
        
        let isOnDemoPage = webView.buttons.matching(NSPredicate(format: "label CONTAINS %@", "新規口座開設")).firstMatch.exists ||
                           webView.buttons.matching(NSPredicate(format: "label CONTAINS %@", "パスキーでログイン")).firstMatch.exists ||
                           webView.buttons.matching(NSPredicate(format: "label CONTAINS %@", "ログアウト")).firstMatch.exists
        
        if !isOnDemoPage {
            print("[UITest] Not currently on demo page, navigating to https://sp.exarnp1e.com...")
            navigateSafari(safari: safari, url: "https://sp.exarnp1e.com")
            XCTAssertTrue(webView.waitForExistence(timeout: 10), "Safari webview should be visible after navigation")
        }
        
        // Close modal if open
        if webView.buttons["✕"].exists && webView.buttons["✕"].isHittable {
            print("[UITest] Closing open modal with ✕...")
            webView.buttons["✕"].tap()
            Thread.sleep(forTimeInterval: 0.5)
        }
        
        // If already logged in from previous run, log out first
        let existingLogout = webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "ログアウト", "Log Out")).firstMatch
        if existingLogout.exists {
            print("[UITest] Found existing active session, logging out first...")
            existingLogout.tap()
            Thread.sleep(forTimeInterval: 1.5)
        }
        
        // -------------------------------------------------------------
        // Step 1: 新規口座開設 (Passkey Registration)
        // -------------------------------------------------------------
        let tabSignup = webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "新規口座開設", "Open Account")).firstMatch
        if tabSignup.waitForExistence(timeout: 5) {
            print("[UITest] Selecting 'Open Account' tab...")
            tabSignup.tap()
            Thread.sleep(forTimeInterval: 0.5)
        }
        
        let btnSignup = webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@ OR label CONTAINS[c] %@", "パスキーを作成して口座開設", "Create Passkey", "Issue & Register Passkey")).firstMatch
        XCTAssertTrue(btnSignup.waitForExistence(timeout: 8), "Sign up passkey button should exist")
        
        print("[UITest] Tapping signup button: '\(btnSignup.label)'...")
        btnSignup.tap()
        
        // Handle Passkey Registration Flow
        let signupHandled = handlePasskeyFlow(step: "registration", springboard: springboard, safari: safari, webView: webView)
        XCTAssertTrue(signupHandled, "Passkey registration flow should succeed and reach dashboard")
        
        // Verify Dashboard appears with balance
        let balanceText = webView.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "¥100,000")).firstMatch
        XCTAssertTrue(balanceText.waitForExistence(timeout: 10), "Dashboard should show initial bonus balance of ¥100,000")
        saveScreenshot(name: "step1_signup_success")
        
        // -------------------------------------------------------------
        // Step 2: ログアウト (Logout)
        // -------------------------------------------------------------
        let btnLogout = webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "ログアウト", "Log Out")).firstMatch
        XCTAssertTrue(btnLogout.waitForExistence(timeout: 5), "Logout button should exist on dashboard")
        btnLogout.tap()
        
        let tabLogin = webView.buttons.matching(NSPredicate(format: "label ==[c] %@ OR label ==[c] %@", "ログイン", "Sign In")).firstMatch
        if tabLogin.waitForExistence(timeout: 3) && tabLogin.isHittable {
            print("[UITest] Selecting exact 'Sign In' / 'ログイン' tab...")
            tabLogin.tap()
            Thread.sleep(forTimeInterval: 0.5)
        }
        
        var btnLogin = webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "パスキーでログイン", "Sign In with Passkey")).firstMatch
        if !btnLogin.exists {
            print("[UITest] Login button not visible yet, refreshing page...")
            navigateSafari(safari: safari, url: "https://sp.exarnp1e.com")
            _ = webView.waitForExistence(timeout: 5)
            btnLogin = webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "パスキーでログイン", "Sign In with Passkey")).firstMatch
        }
        
        XCTAssertTrue(btnLogin.waitForExistence(timeout: 10), "Login with passkey button should be visible after logout")
        saveScreenshot(name: "step2_logout_success")
        
        // -------------------------------------------------------------
        // Step 3: パスキーでログイン (Passkey Assertion)
        // -------------------------------------------------------------
        print("[UITest] Tapping login button: '\(btnLogin.label)'...")
        btnLogin.tap()
        
        // Handle Passkey Assertion Flow
        let loginHandled = handlePasskeyFlow(step: "assertion", springboard: springboard, safari: safari, webView: webView)
        XCTAssertTrue(loginHandled, "Passkey assertion flow should succeed and reach dashboard")
        
        // Verify Dashboard appears again
        let balanceAfterLogin = webView.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "¥100,000")).firstMatch
        XCTAssertTrue(balanceAfterLogin.waitForExistence(timeout: 10), "Dashboard should show balance after passkey login")
        saveScreenshot(name: "step3_login_success")
        
        // -------------------------------------------------------------
        // Step 4: My CredMan アプリでパスキーの保存を確認
        // -------------------------------------------------------------
        print("[UITest] Step 4: Verifying saved passkey in My CredMan app...")
        let myCredMan = XCUIApplication(bundleIdentifier: "com.exarnp1e.mycredman")
        myCredMan.activate()
        Thread.sleep(forTimeInterval: 2.0)
        
        let savedTab = myCredMan.tabBars.buttons.matching(NSPredicate(format: "label CONTAINS %@", "保存済み")).firstMatch
        if savedTab.waitForExistence(timeout: 5) && savedTab.isHittable {
            print("[UITest] Tapping '保存済み' tab...")
            savedTab.tap()
            Thread.sleep(forTimeInterval: 1.5)
        }
        
        saveScreenshot(name: "step4_mycredman_saved_passkeys")
        print("[UITest] My CredMan UI hierarchy:\n\(myCredMan.debugDescription)")
        
        let savedCard = myCredMan.staticTexts["Scoped Passkey Bank"]
        XCTAssertTrue(savedCard.waitForExistence(timeout: 10), "Saved passkey card 'Scoped Passkey Bank' must appear in My CredMan app")
        
        let userText = myCredMan.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "alice@example.com")).firstMatch
        XCTAssertTrue(userText.exists, "Passkey card must display 'alice@example.com'")
        
        if savedCard.isHittable {
            savedCard.tap()
            Thread.sleep(forTimeInterval: 1.5)
            saveScreenshot(name: "step4_mycredman_passkey_detail")
        }
    }
    
    func testInspectSavedPasskeysInMyCredMan() {
        print("[UITest] Launching My CredMan app directly to inspect saved passkeys...")
        let myCredMan = XCUIApplication(bundleIdentifier: "com.exarnp1e.mycredman")
        myCredMan.launch()
        XCTAssertTrue(myCredMan.wait(for: .runningForeground, timeout: 10))
        Thread.sleep(forTimeInterval: 2.0)
        
        let savedTab = myCredMan.tabBars.buttons.matching(NSPredicate(format: "label CONTAINS %@", "保存済み")).firstMatch
        if savedTab.waitForExistence(timeout: 5) && savedTab.isHittable {
            print("[UITest] Tapping '保存済み' tab...")
            savedTab.tap()
            Thread.sleep(forTimeInterval: 1.5)
        }
        
        saveScreenshot(name: "inspect_mycredman_saved_passkeys")
        print("[UITest] My CredMan UI hierarchy:\n\(myCredMan.debugDescription)")
        
        let savedCard = myCredMan.staticTexts["Scoped Passkey Bank"]
        if savedCard.exists && savedCard.isHittable {
            print("[UITest] Tapping 'Scoped Passkey Bank' card for detail...")
            savedCard.tap()
            Thread.sleep(forTimeInterval: 1.5)
            saveScreenshot(name: "inspect_mycredman_passkey_detail")
        }
    }
    
    func testSavedPasskeysListAndSwipeToDelete() throws {
        print("[UITest] Testing SavedPasskeys list and swipe-to-delete...")
        let myCredMan = XCUIApplication(bundleIdentifier: "com.exarnp1e.mycredman")
        
        // 1. Launch with empty / reset or check current state
        myCredMan.launch()
        XCTAssertTrue(myCredMan.wait(for: .runningForeground, timeout: 10))
        Thread.sleep(forTimeInterval: 2.0)
        
        // If there's any existing "全削除" button, tap it to start clean
        let clearAllBtn = myCredMan.buttons["全削除"]
        if clearAllBtn.exists && clearAllBtn.isHittable {
            print("[UITest] Clearing existing passkeys to start with empty state...")
            clearAllBtn.tap()
            Thread.sleep(forTimeInterval: 1.0)
            let deleteConfirm = myCredMan.alerts.buttons["削除"]
            if deleteConfirm.waitForExistence(timeout: 3) {
                deleteConfirm.tap()
                Thread.sleep(forTimeInterval: 1.5)
            }
        }
        
        // Check empty state
        let emptyText = myCredMan.staticTexts["保存されたパスキーはありません"]
        XCTAssertTrue(emptyText.waitForExistence(timeout: 5), "Empty state text should be visible")
        
        // Assert that the demo passkey creation button NO LONGER exists in the UI!
        let demoBtn = myCredMan.buttons["デモ用パスキーを作成して保存"]
        XCTAssertFalse(demoBtn.exists, "Demo passkey creation button must NOT exist in the UI")
        
        saveScreenshot(name: "saved_passkeys_empty_state")
        print("[UITest] Confirmed: empty state is shown and demo button is deleted.")
        
        // 2. Launch with --add-demo-passkey to add a passkey
        myCredMan.terminate()
        Thread.sleep(forTimeInterval: 1.0)
        
        myCredMan.launchArguments = ["--add-demo-passkey"]
        myCredMan.launch()
        XCTAssertTrue(myCredMan.wait(for: .runningForeground, timeout: 10))
        Thread.sleep(forTimeInterval: 2.0)
        
        let passkeyRow = myCredMan.staticTexts["Scoped Passkey Bank"]
        XCTAssertTrue(passkeyRow.waitForExistence(timeout: 5), "Added passkey should be listed in the List")
        saveScreenshot(name: "saved_passkeys_list_with_item")
        print("[UITest] Confirmed: Passkey listed in iOS standard List.")
        
        // 3. Swipe left to delete
        print("[UITest] Swiping cell to delete...")
        passkeyRow.swipeLeft()
        Thread.sleep(forTimeInterval: 1.0)
        
        saveScreenshot(name: "saved_passkeys_swiped_revealing_delete")
        
        let deleteBtn = myCredMan.buttons["削除"]
        if deleteBtn.exists && deleteBtn.isHittable {
            print("[UITest] Tapping '削除' button from swipe action...")
            deleteBtn.tap()
        } else {
            print("[UITest] Full swipe might have deleted, or checking list...")
        }
        Thread.sleep(forTimeInterval: 2.0)
        
        saveScreenshot(name: "saved_passkeys_after_swipe_deleted")
        
        // Verify passkey row no longer exists
        XCTAssertFalse(passkeyRow.exists, "Passkey should be removed after swipe to delete")
        XCTAssertTrue(emptyText.waitForExistence(timeout: 5), "Empty state should be displayed again")
        print("[UITest] Successfully verified swipe to delete and empty state!")
    }
    
    func testAutoFillBannerVisibility() throws {
        print("[UITest] Testing AutoFill banner visibility based on enabled/disabled state...")
        let myCredMan = XCUIApplication(bundleIdentifier: "com.exarnp1e.mycredman")
        
        // 1. Launch with genuine device settings (where AutoFill is currently ON)
        myCredMan.launch()
        XCTAssertTrue(myCredMan.wait(for: .runningForeground, timeout: 10))
        Thread.sleep(forTimeInterval: 2.0)
        
        let autoFillTitle = myCredMan.staticTexts["自動入力 (AutoFill) 設定"]
        print("[UITest] Checking AutoFill banner when enabled: exists=\(autoFillTitle.exists)")
        XCTAssertFalse(autoFillTitle.exists, "AutoFill banner MUST be hidden when AutoFill is enabled")
        saveScreenshot(name: "autofill_banner_hidden_when_enabled")
        
        // 2. Launch with mock disabled to verify it shows up when NOT enabled
        myCredMan.terminate()
        Thread.sleep(forTimeInterval: 1.0)
        
        myCredMan.launchArguments = ["--mock-autofill-disabled"]
        myCredMan.launch()
        XCTAssertTrue(myCredMan.wait(for: .runningForeground, timeout: 10))
        Thread.sleep(forTimeInterval: 2.0)
        
        let disabledAutoFillTitle = myCredMan.staticTexts["自動入力 (AutoFill) 設定"]
        print("[UITest] Checking AutoFill banner when disabled: exists=\(disabledAutoFillTitle.exists)")
        XCTAssertTrue(disabledAutoFillTitle.waitForExistence(timeout: 5), "AutoFill banner MUST be visible when AutoFill is disabled")
        saveScreenshot(name: "autofill_banner_shown_when_disabled")
        print("[UITest] Successfully verified AutoFill banner conditional visibility!")
    }
    
    func testCheckSafariAssertionAfterDeletion() throws {
        print("[UITest] Investigating Safari assertion behavior after deletion...")
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        
        safari.launch()
        Thread.sleep(forTimeInterval: 1.5)
        
        let webView = safari.webViews.firstMatch
        if !webView.waitForExistence(timeout: 5) {
            navigateSafari(safari: safari, url: "https://sp.exarnp1e.com")
        }
        _ = webView.waitForExistence(timeout: 8)
        
        // If logged in, logout
        let logoutBtn = webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "ログアウト", "Log Out")).firstMatch
        if logoutBtn.exists {
            print("[UITest] Logging out first...")
            logoutBtn.tap()
            Thread.sleep(forTimeInterval: 1.5)
        }
        
        // Tap Sign In tab
        let tabLogin = webView.buttons.matching(NSPredicate(format: "label ==[c] %@ OR label ==[c] %@", "ログイン", "Sign In")).firstMatch
        if tabLogin.waitForExistence(timeout: 3) && tabLogin.isHittable {
            tabLogin.tap()
            Thread.sleep(forTimeInterval: 0.5)
        }
        
        let btnLogin = webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "パスキーでログイン", "Sign In with Passkey")).firstMatch
        XCTAssertTrue(btnLogin.waitForExistence(timeout: 8), "Sign In with Passkey button must exist")
        print("[UITest] Tapping 'Sign In with Passkey'...")
        btnLogin.tap()
        Thread.sleep(forTimeInterval: 2.0)
        
        saveScreenshot(name: "investigate_safari_assertion_sheet")
        print("[UITest] SpringBoard hierarchy after tapping Sign In with Passkey:\n\(springboard.debugDescription)")
        
        let usePasskeyBtn = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "Use Selected Passkey", "選択したパスキーを使用")).firstMatch
        if usePasskeyBtn.exists && usePasskeyBtn.isHittable {
            print("[UITest] 'Use Selected Passkey' button found! Tapping it...")
            usePasskeyBtn.tap()
            Thread.sleep(forTimeInterval: 3.0)
        } else {
            let continueBtn = springboard.descendants(matching: .any)["ASAuthorizationControllerContinueButton"]
            if continueBtn.exists && continueBtn.isHittable {
                print("[UITest] 'ASAuthorizationControllerContinueButton' found! Tapping it...")
                continueBtn.tap()
                Thread.sleep(forTimeInterval: 3.0)
            }
        }
        
        saveScreenshot(name: "investigate_safari_after_tapping_assertion")
        print("[UITest] Web view after assertion tap:\n\(webView.debugDescription)")
    }
    
    private func navigateSafari(safari: XCUIApplication, url: String) {
        let addressField = safari.textFields["URL"]
        let urlBar = safari.textFields["TabBarItemTitle"]
        let addressButton = safari.buttons["TabBarItemTitle"]
        let capsuleButton = safari.buttons.matching(NSPredicate(format: "identifier CONTAINS %@", "CapsuleURLField")).firstMatch
        
        if addressField.exists && addressField.isHittable {
            addressField.tap()
            addressField.typeText("\(url)\n")
        } else if urlBar.exists && urlBar.isHittable {
            urlBar.tap()
            if addressField.waitForExistence(timeout: 3) {
                addressField.typeText("\(url)\n")
            }
        } else if addressButton.exists && addressButton.isHittable {
            addressButton.tap()
            if addressField.waitForExistence(timeout: 3) {
                addressField.typeText("\(url)\n")
            }
        } else if capsuleButton.exists && capsuleButton.isHittable {
            capsuleButton.tap()
            if addressField.waitForExistence(timeout: 3) {
                addressField.typeText("\(url)\n")
            }
        } else if safari.textFields.firstMatch.exists {
            let tf = safari.textFields.firstMatch
            tf.tap()
            tf.typeText("\(url)\n")
        }
        Thread.sleep(forTimeInterval: 2.0)
    }
    
    private func handlePasskeyFlow(
        step: String,
        springboard: XCUIApplication,
        safari: XCUIApplication,
        webView: XCUIElement
    ) -> Bool {
        print("[UITest] Handling passkey flow for \(step)...")
        let startTime = Date()
        var hasTappedMyCredMan = false
        var hasTappedDetails = false
        var hasSelectedAlice = false
        var hasTappedContinue = false
        
        Thread.sleep(forTimeInterval: 1.5)
        print("[DEBUG_DUMP_SPRINGBOARD]:\n\(springboard.debugDescription)")
        print("[DEBUG_DUMP_SAFARI]:\n\(safari.debugDescription)")
        
        while Date().timeIntervalSince(startTime) < 45 {
            // Check if dashboard reached
            let dashboard = webView.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "普通預金 残高", "Savings Balance")).firstMatch
            let logoutBtn = webView.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "ログアウト", "Log Out")).firstMatch
            let balance = webView.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "¥100,000")).firstMatch
            if dashboard.exists || (logoutBtn.exists && balance.exists) {
                print("[UITest] Dashboard detected! Successfully completed \(step).")
                return true
            }
            
            var tappedAny = false
            
            // 1. If "パスキーを登録" (button inside My CredMan extension UI) is visible, tap it!
            let regBtn = springboard.buttons["パスキーを登録"]
            if regBtn.exists && regBtn.isHittable {
                print("[UITest] Tapping 'パスキーを登録' button in My CredMan extension!")
                regBtn.tap()
                tappedAny = true
                saveScreenshot(name: "\(step)_tapped_reg_btn")
                Thread.sleep(forTimeInterval: 1.5)
                continue
            }
            
            // 2. In registration:
            if step == "registration" {
                // Select My CredMan FIRST if not selected yet
                if !hasTappedMyCredMan {
                    let myCredManOption = springboard.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "My CredMan")).firstMatch
                    if myCredManOption.exists && myCredManOption.isHittable {
                        print("[UITest] Selecting '\(myCredManOption.label)' in registration sheet...")
                        myCredManOption.tap()
                        hasTappedMyCredMan = true
                        tappedAny = true
                        saveScreenshot(name: "\(step)_selected_mycredman")
                        Thread.sleep(forTimeInterval: 1.0)
                        continue
                    }
                    
                    let myCredManText = springboard.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "My CredMan")).firstMatch
                    if myCredManText.exists && myCredManText.isHittable {
                        print("[UITest] Selecting staticText '\(myCredManText.label)' in registration sheet...")
                        myCredManText.tap()
                        hasTappedMyCredMan = true
                        tappedAny = true
                        saveScreenshot(name: "\(step)_selected_mycredman")
                        Thread.sleep(forTimeInterval: 1.0)
                        continue
                    }
                }
                
                // ONLY AFTER My CredMan is selected, tap Add Passkey or Continue ONCE:
                if !hasTappedContinue {
                    let addBtn = springboard.buttons.matching(NSPredicate(format: "label ==[c] %@ OR label ==[c] %@", "Add Passkey", "パスキーを追加")).firstMatch
                    if addBtn.exists && addBtn.isHittable {
                        print("[UITest] Tapping '\(addBtn.label)' button in registration sheet...")
                        addBtn.tap()
                        hasTappedContinue = true
                        tappedAny = true
                        saveScreenshot(name: "\(step)_tapped_add_btn")
                        Thread.sleep(forTimeInterval: 2.0)
                        continue
                    }
                    
                    let continueButton = springboard.descendants(matching: .any)["ASAuthorizationControllerContinueButton"]
                    if continueButton.exists && continueButton.isHittable {
                        print("[UITest] Tapping ASAuthorizationControllerContinueButton...")
                        continueButton.tap()
                        hasTappedContinue = true
                        tappedAny = true
                        saveScreenshot(name: "\(step)_tapped_continue_btn")
                        Thread.sleep(forTimeInterval: 2.0)
                        continue
                    }
                }
            }
            
            // 3. In assertion:
            if step == "assertion" {
                if !hasSelectedAlice {
                    // Try to select My CredMan passkey first if identifiable
                    let myCredManAlice = springboard.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ AND label CONTAINS[c] %@", "alice", "My CredMan")).firstMatch
                    if myCredManAlice.exists && myCredManAlice.isHittable {
                        print("[UITest] Selecting My CredMan credential: '\(myCredManAlice.label)'")
                        myCredManAlice.tap()
                        hasSelectedAlice = true
                        tappedAny = true
                        saveScreenshot(name: "assertion_selected_alice_mycredman")
                        Thread.sleep(forTimeInterval: 1.5)
                        continue
                    }
                    
                    let myCredManBtn = springboard.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "My CredMan")).firstMatch
                    if myCredManBtn.exists && myCredManBtn.isHittable {
                        print("[UITest] Selecting My CredMan credential button: '\(myCredManBtn.label)'")
                        myCredManBtn.tap()
                        hasSelectedAlice = true
                        tappedAny = true
                        saveScreenshot(name: "assertion_selected_mycredman")
                        Thread.sleep(forTimeInterval: 1.5)
                        continue
                    }
                    
                    // Note: In assertion sheet, My CredMan passkey is typically already selected
                    hasSelectedAlice = true
                }
                
                if !hasTappedContinue {
                    let continueButton = springboard.descendants(matching: .any)["ASAuthorizationControllerContinueButton"]
                    if continueButton.exists && continueButton.isHittable {
                        print("[UITest] Tapping ASAuthorizationControllerContinueButton for assertion...")
                        continueButton.tap()
                        hasTappedContinue = true
                        tappedAny = true
                        saveScreenshot(name: "\(step)_tapped_continue_btn")
                        Thread.sleep(forTimeInterval: 3.0)
                        continue
                    }
                    
                    let usePasskeyBtn = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@", "Use Selected Passkey", "選択したパスキーを使用")).firstMatch
                    if usePasskeyBtn.exists && usePasskeyBtn.isHittable {
                        print("[UITest] Tapping '\(usePasskeyBtn.label)' button...")
                        usePasskeyBtn.tap()
                        hasTappedContinue = true
                        tappedAny = true
                        saveScreenshot(name: "\(step)_tapped_use_passkey")
                        Thread.sleep(forTimeInterval: 3.0)
                        continue
                    }
                    
                    let loginBtn = springboard.buttons.matching(NSPredicate(format: "label ==[c] %@ OR label ==[c] %@", "Log In", "ログイン")).firstMatch
                    if loginBtn.exists && loginBtn.isHittable {
                        print("[UITest] Tapping '\(loginBtn.label)' in springboard...")
                        loginBtn.tap()
                        hasTappedContinue = true
                        tappedAny = true
                        saveScreenshot(name: "\(step)_tapped_login_btn")
                        Thread.sleep(forTimeInterval: 3.0)
                        continue
                    }
                }
            }
            
            // 4. Try general confirmation action buttons in Springboard (only if continue hasn't been tapped)
            if !hasTappedContinue {
                let actionTargets = [
                "パスキーを追加", "パスキーを保存", "保存", "Save Passkey", "Save",
                "続ける", "Continue", "次へ", "Next",
                "ログイン", "サインイン", "Log In", "Sign In",
                "選択したパスキーを使用", "実行する", "パスキーを使用", "Use Passkey", "OK", "Turn On", "Use"
            ]
            for target in actionTargets {
                let btn = springboard.buttons[target]
                if btn.exists && btn.isHittable {
                    print("[UITest] Tapping SpringBoard button: '\(target)'")
                    btn.tap()
                    tappedAny = true
                    Thread.sleep(forTimeInterval: 1.5)
                    break
                }
                
                let partialBtn = springboard.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", target)).firstMatch
                if partialBtn.exists && partialBtn.isHittable {
                    print("[UITest] Tapping partial SpringBoard button: '\(partialBtn.label)'")
                    partialBtn.tap()
                    tappedAny = true
                    Thread.sleep(forTimeInterval: 1.5)
                    break
                }
            }
            
            if tappedAny { continue }
            
            // 5. Try in Safari non-webview
            for target in actionTargets {
                let btn = safari.buttons[target]
                if btn.exists && btn.isHittable && !webView.buttons[target].exists {
                    print("[UITest] Tapping Safari non-webview button: '\(target)'")
                    btn.tap()
                    tappedAny = true
                    Thread.sleep(forTimeInterval: 1.5)
                    break
                }
            }
            }
            
            Thread.sleep(forTimeInterval: 0.5)
        }
        
        saveScreenshot(name: "\(step)_flow_timeout")
        print("[UITest] Flow timed out waiting for dashboard for \(step).")
        return false
    }
    
    private func saveScreenshot(name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        print("[UITest] Saved screenshot '\(name)'")
    }
}
