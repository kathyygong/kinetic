import XCTest

final class BehaviorPatternAccessibilityUITests: XCTestCase {
    private let previewIdentifier = "behavior-pattern-qa-preview"

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
    }

    override func tearDownWithError() throws {
        XCUIDevice.shared.orientation = .portrait
    }

    func testSuccessFixtureSupportsSmallScreenPortraitAndLandscape() throws {
        let portraitApp = launch(state: "success", orientation: .portrait)
        try assertAllPatternCards(in: portraitApp, auditing: false)
        attachScreenshot(of: portraitApp, name: "behavior-patterns-portrait")
        portraitApp.terminate()

        let landscapeApp = launch(state: "success", orientation: .landscapeLeft)
        try assertAllPatternCards(in: landscapeApp, auditing: false)
        attachScreenshot(of: landscapeApp, name: "behavior-patterns-landscape")
    }

    func testSuccessFixturePassesAccessibilityAudit() throws {
        let app = launch(state: "success")
        try auditVisibleScreen(in: app)
        try assertAllPatternCards(in: app, auditing: true)
    }

    func testLoadingFailureAndConfirmedStatesStayReadOnly() throws {
        let loadingApp = launch(state: "loading")
        XCTAssertTrue(
            loadingApp.staticTexts["Reviewing bounded recommendation history"]
                .waitForExistence(timeout: 3)
        )
        try auditVisibleScreen(in: loadingApp)
        loadingApp.terminate()

        let failureApp = launch(state: "failure")
        XCTAssertTrue(
            failureApp.staticTexts["Behavior memory is offline"]
                .waitForExistence(timeout: 3)
        )
        let retryButton = failureApp.buttons["Retry"]
        XCTAssertTrue(retryButton.exists)
        XCTAssertFalse(retryButton.isEnabled)
        try auditVisibleScreen(in: failureApp)
        failureApp.terminate()

        let confirmedApp = launch(state: "confirmed")
        let confirmedButton = confirmedApp.buttons["Using this preference"]
        scrollToElement(confirmedButton, in: confirmedApp)
        XCTAssertTrue(confirmedButton.exists)
        XCTAssertFalse(confirmedButton.isEnabled)
        try auditVisibleScreen(in: confirmedApp)
    }

    private func launch(
        state: String,
        orientation: UIDeviceOrientation = .portrait
    ) -> XCUIApplication {
        XCUIDevice.shared.orientation = orientation
        let app = XCUIApplication()
        app.launchArguments = [
            "-kinetic.qa-behavior-patterns", "YES",
            "-kinetic.qa-behavior-patterns-state", state
        ]
        app.launch()

        let preview = app.descendants(matching: .any)[previewIdentifier]
        XCTAssertTrue(preview.waitForExistence(timeout: 5))
        return app
    }

    private func assertAllPatternCards(
        in app: XCUIApplication,
        auditing: Bool
    ) throws {
        let expectations = [
            (
                "behavior-pattern-pattern_heavy_calendar_misses",
                "Heavy calendar",
                "Review busy-day preference"
            ),
            (
                "behavior-pattern-pattern_long_run_day_preference_sat",
                "Saturday long runs",
                "Open web schedule review"
            ),
            (
                "behavior-pattern-pattern_stale_data_or_checkin_gap_sync_readiness",
                "Readiness needs a refresh",
                "Sync readiness"
            ),
            (
                "behavior-pattern-pattern_pain_or_discomfort_recurrence",
                "Repeated discomfort",
                nil
            )
        ]

        for (identifier, title, actionLabel) in expectations {
            let titleElement = app.staticTexts[title]
            scrollToElement(titleElement, in: app)
            XCTAssertTrue(titleElement.exists, "Missing pattern title: \(title)")

            let card = app.descendants(matching: .any)[identifier]
            XCTAssertTrue(card.exists, "Missing pattern card: \(identifier)")
            if auditing {
                try auditVisibleScreen(in: app)
            }

            if let actionLabel {
                let action = app.buttons[actionLabel].firstMatch
                scrollToElement(action, in: app)
                XCTAssertTrue(action.exists, "Missing action: \(actionLabel)")
                XCTAssertFalse(action.isEnabled, "QA action must remain read-only")
                if auditing {
                    try auditVisibleScreen(in: app)
                }
            }
        }
    }

    private func scrollToElement(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<30 {
            if element.exists {
                return
            }
            let start = app.coordinate(
                withNormalizedOffset: CGVector(dx: 0.5, dy: 0.66)
            )
            let end = app.coordinate(
                withNormalizedOffset: CGVector(dx: 0.5, dy: 0.56)
            )
            start.press(forDuration: 0.01, thenDragTo: end)
        }
    }

    private func auditVisibleScreen(in app: XCUIApplication) throws {
        if #available(iOS 17.0, *) {
            let auditTypes: XCUIAccessibilityAuditType = [
                .elementDetection,
                .hitRegion,
                .sufficientElementDescription,
                .trait
            ]
            try app.performAccessibilityAudit(for: auditTypes) { issue in
                // The read-only fixture intentionally disables its actions,
                // and XCTest can report non-actionable findings for those
                // controls and the system-owned Done button. Keep the allowlist
                // label-exact so any unexpected finding still fails the test.
                let ignoredPreviewLabels: Set<String> = [
                    "Done",
                    "Retry",
                    "Using this preference",
                    "Review busy-day preference",
                    "Open web schedule review",
                    "Sync readiness"
                ]
                if let label = issue.element?.label,
                   ignoredPreviewLabels.contains(label) {
                    return true
                }
                return false
            }
        }
    }

    private func attachScreenshot(of app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
