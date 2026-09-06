import XCTest

final class SafariPasskeyE2ETests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testPasskeyFullFlowInSafari() throws {
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        
        safari.launch()
        
        // Ensure Safari is open on sp.exarnp1e.com
        let urlBar = safari.textFields["TabBarItemTitle"]
        if urlBar.exists {
            urlBar.tap()
            let addressField = safari.textFields["URL"]
            if addressField.waitForExistence(timeout: 3) {
                addressField.typeText("https://sp.exarnp1e.com\r")
            }
        } else {
            let addressField = safari.textFields["URL"]
            if addressField.exists {
                addressField.tap()
                addressField.typeText("https://sp.exarnp1e.com\r")
            }
        }
        
        let webView = safari.webViews.firstMatch
        XCTAssertTrue(webView.waitForExistence(timeout: 10), "Safari webview should be visible")
        
        // If already logged in from previous run, log out first
        let existingLogout = webView.buttons.matching(NSPredicate(format: "label CONTAINS %@", "ログアウト")).firstMatch
        if existingLogout.exists {
            print("[UITest] Found existing active session, logging out first...")
            existingLogout.tap()
            Thread.sleep(forTimeInterval: 1.5)
        }
        
        // -------------------------------------------------------------
        // Step 1: 新規口座開設 (Passkey Registration)
        // -------------------------------------------------------------
        let tabSignup = webView.buttons.matching(NSPredicate(format: "label CONTAINS %@", "新規口座開設")).firstMatch
        if tabSignup.waitForExistence(timeout: 5) {
            tabSignup.tap()
            Thread.sleep(forTimeInterval: 0.5)
        }
        
        let btnSignup = webView.buttons.matching(NSPredicate(format: "label CONTAINS %@", "パスキーを作成して口座開設")).firstMatch
        XCTAssertTrue(btnSignup.waitForExistence(timeout: 5), "Sign up passkey button should exist")
        
        print("[UITest] Tapping signup button...")
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
        let btnLogout = webView.buttons.matching(NSPredicate(format: "label CONTAINS %@", "ログアウト")).firstMatch
        XCTAssertTrue(btnLogout.waitForExistence(timeout: 5), "Logout button should exist on dashboard")
        btnLogout.tap()
        
        let tabLogin = webView.buttons["ログイン"]
        if tabLogin.waitForExistence(timeout: 3) && tabLogin.isHittable {
            print("[UITest] Selecting exact 'ログイン' tab...")
            tabLogin.tap()
            Thread.sleep(forTimeInterval: 0.5)
        }
        
        var btnLogin = webView.buttons.matching(NSPredicate(format: "label CONTAINS %@", "パスキーでログイン")).firstMatch
        if !btnLogin.exists {
            print("[UITest] Login button not visible yet, refreshing page...")
            let addressField = safari.textFields["URL"]
            if addressField.exists {
                addressField.tap()
                addressField.typeText("https://sp.exarnp1e.com\r")
            } else {
                let urlBar = safari.textFields["TabBarItemTitle"]
                if urlBar.exists {
                    urlBar.tap()
                    let urlInput = safari.textFields["URL"]
                    if urlInput.waitForExistence(timeout: 3) {
                        urlInput.typeText("https://sp.exarnp1e.com\r")
                    }
                }
            }
            _ = webView.waitForExistence(timeout: 5)
            btnLogin = webView.buttons.matching(NSPredicate(format: "label CONTAINS %@", "パスキーでログイン")).firstMatch
        }
        
        XCTAssertTrue(btnLogin.waitForExistence(timeout: 10), "Login with passkey button should be visible after logout")
        saveScreenshot(name: "step2_logout_success")
        
        // -------------------------------------------------------------
        // Step 3: パスキーでログイン (Passkey Assertion)
        // -------------------------------------------------------------
        print("[UITest] Tapping login button...")
        btnLogin.tap()
        
        // Handle Passkey Assertion Flow
        let loginHandled = handlePasskeyFlow(step: "assertion", springboard: springboard, safari: safari, webView: webView)
        XCTAssertTrue(loginHandled, "Passkey assertion flow should succeed and reach dashboard")
        
        // Verify Dashboard appears again
        let balanceAfterLogin = webView.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "¥100,000")).firstMatch
        XCTAssertTrue(balanceAfterLogin.waitForExistence(timeout: 10), "Dashboard should show balance after passkey login")
        saveScreenshot(name: "step3_login_success")
    }
    
    private func handlePasskeyFlow(
        step: String,
        springboard: XCUIApplication,
        safari: XCUIApplication,
        webView: XCUIElement
    ) -> Bool {
        print("[UITest] Handling passkey flow for \(step)...")
        let startTime = Date()
        var hasTappedDetails = false
        var hasTappedMyCredMan = false
        var hasSelectedAlice = false
        
        var targetTexts = [
            "選択したパスキーを使用", "パスキーを追加", "パスキーでログイン", "続ける", "Continue", "サインイン", "登録",
            "パスキーを登録", "実行する", "パスキーを使用", "使用", "OK"
        ]
        if step == "assertion" {
            targetTexts.append("ログイン")
            targetTexts.append("My CredMan")
        }
        
        while Date().timeIntervalSince(startTime) < 35 {
            // Check if dashboard reached
            let dashboard = webView.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "普通預金 残高")).firstMatch
            if dashboard.exists {
                print("[UITest] Dashboard '普通預金 残高' detected! Successfully completed \(step).")
                return true
            }
            
            var tappedAny = false
            
            // 1. If "My CredMan に保存" or any My CredMan option is visible, prioritize selecting it!
            let myCredManBtn = springboard.buttons.matching(NSPredicate(format: "label CONTAINS %@", "My CredMan")).firstMatch
            if myCredManBtn.exists && myCredManBtn.isHittable && !hasTappedMyCredMan {
                print("[UITest] Selecting My CredMan button: '\(myCredManBtn.label)'")
                myCredManBtn.tap()
                hasTappedMyCredMan = true
                tappedAny = true
                saveScreenshot(name: "\(step)_selected_mycredman_btn")
                Thread.sleep(forTimeInterval: 1.5)
                continue
            }
            
            let myCredManTxt = springboard.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "My CredMan")).firstMatch
            if myCredManTxt.exists && myCredManTxt.isHittable && !hasTappedMyCredMan {
                print("[UITest] Selecting My CredMan staticText: '\(myCredManTxt.label)'")
                myCredManTxt.tap()
                hasTappedMyCredMan = true
                tappedAny = true
                saveScreenshot(name: "\(step)_selected_mycredman_txt")
                Thread.sleep(forTimeInterval: 1.5)
                continue
            }
            
            // 2. If assertion step and credential for alice@example.com is visible, tap it!
            if step == "assertion" && !hasSelectedAlice {
                let aliceBtn = springboard.buttons.matching(NSPredicate(format: "label CONTAINS %@", "alice@example.com")).firstMatch
                if aliceBtn.exists && aliceBtn.isHittable {
                    print("[UITest] Selecting credential button for alice@example.com")
                    aliceBtn.tap()
                    hasSelectedAlice = true
                    tappedAny = true
                    saveScreenshot(name: "assertion_selected_alice_btn")
                    Thread.sleep(forTimeInterval: 1.5)
                    continue
                }
                let aliceTxt = springboard.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "alice@example.com")).firstMatch
                if aliceTxt.exists && aliceTxt.isHittable {
                    print("[UITest] Selecting credential staticText for alice@example.com")
                    aliceTxt.tap()
                    hasSelectedAlice = true
                    tappedAny = true
                    saveScreenshot(name: "assertion_selected_alice_txt")
                    Thread.sleep(forTimeInterval: 1.5)
                    continue
                }
            }
            
            // 3. Try finding explicit primary action buttons in Springboard
            for target in targetTexts {
                let btn = springboard.buttons[target]
                if btn.exists && btn.isHittable {
                    print("[UITest] Tapping explicit SpringBoard button: '\(target)'")
                    btn.tap()
                    tappedAny = true
                    Thread.sleep(forTimeInterval: 1.5)
                    break
                }
                
                let txt = springboard.staticTexts[target]
                if txt.exists && txt.isHittable {
                    print("[UITest] Tapping explicit SpringBoard staticText: '\(target)'")
                    txt.tap()
                    tappedAny = true
                    Thread.sleep(forTimeInterval: 1.5)
                    break
                }
                
                let partialBtn = springboard.buttons.matching(NSPredicate(format: "label CONTAINS %@", target)).firstMatch
                if partialBtn.exists && partialBtn.isHittable {
                    print("[UITest] Tapping partial SpringBoard button: '\(partialBtn.label)'")
                    partialBtn.tap()
                    tappedAny = true
                    Thread.sleep(forTimeInterval: 1.5)
                    break
                }
                
                let partialTxt = springboard.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", target)).firstMatch
                if partialTxt.exists && partialTxt.isHittable {
                    print("[UITest] Tapping partial SpringBoard staticText: '\(partialTxt.label)'")
                    partialTxt.tap()
                    tappedAny = true
                    Thread.sleep(forTimeInterval: 1.5)
                    break
                }
            }
            
            if tappedAny { continue }
            
            // 3. Try finding elements in Safari that match sheet targets (excluding webView)
            for target in targetTexts {
                let btn = safari.buttons[target]
                if btn.exists && btn.isHittable && !webView.buttons[target].exists {
                    print("[UITest] Tapping Safari non-webview button: '\(target)'")
                    btn.tap()
                    tappedAny = true
                    Thread.sleep(forTimeInterval: 1.5)
                    break
                }
            }
            
            if tappedAny { continue }
            
            // 4. If "詳細設定" button is present and we haven't selected My CredMan yet, tap "詳細設定"
            let detailsBtn = springboard.buttons["詳細設定"]
            if !hasTappedDetails && detailsBtn.exists && detailsBtn.isHittable {
                print("[UITest] '詳細設定' found! Tapping '詳細設定' to reveal provider choices...")
                detailsBtn.tap()
                hasTappedDetails = true
                tappedAny = true
                saveScreenshot(name: "\(step)_after_details_tap")
                Thread.sleep(forTimeInterval: 1.5)
                continue
            }
            
            Thread.sleep(forTimeInterval: 0.5)
        }
        
        saveScreenshot(name: "\(step)_flow_timeout")
        print("[UITest] Flow timed out waiting for dashboard for \(step).")
        return false
    }
    
    private func saveScreenshot(name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let dir = URL(fileURLWithPath: "/Users/kocko/.gemini/antigravity/brain/522085e6-7c10-4cb2-9be6-6ed8c741b902/scratch")
        let fileURL = dir.appendingPathComponent("\(name).png")
        try? screenshot.pngRepresentation.write(to: fileURL)
        print("[UITest] Saved screenshot to \(fileURL.path)")
    }
}
