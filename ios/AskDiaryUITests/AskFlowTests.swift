import XCTest

/// Runs against the mock engine (-MockLLM) so streaming is deterministic.
final class AskFlowTests: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-MockLLM", "-SkipOnboarding"]
        app.launch()
    }

    func testAskShowsStreamedAnswerWithSources() {
        let field = app.textFields["Ask the diary anything…"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("what did the sleep expert say about caffeine?")
        app.buttons["Send question"].tap()
        // the mock answer always cites [1]
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'broken system'"))
            .firstMatch.waitForExistence(timeout: 30))
    }

    func testOnboardingWalkthroughReachesTheStudio() {
        app.terminate()
        app.launchArguments = ["-MockLLM", "-ResetOnboarding"]
        app.launch()

        let continueButton = app.buttons["CONTINUE"]
        XCTAssertTrue(continueButton.waitForExistence(timeout: 10))
        continueButton.tap()  // page 2: privacy
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] 'cannot see your questions'"))
            .firstMatch.waitForExistence(timeout: 5))
        continueButton.tap()  // page 3: Apple Intelligence check
        let start = app.buttons["START ASKING"]
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.tap()
        XCTAssertTrue(app.textFields["Ask the diary anything…"].waitForExistence(timeout: 10))
    }

    func testAnsweredQuestionLandsInHistory() {
        let field = app.textFields["Ask the diary anything…"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        let question = "how do I hire well?"
        field.typeText(question)
        app.buttons["Send question"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'broken system'"))
            .firstMatch.waitForExistence(timeout: 30))

        app.buttons["History"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'hire well'"))
            .firstMatch.waitForExistence(timeout: 10))
    }
}
