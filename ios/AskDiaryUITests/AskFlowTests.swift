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
        let field = app.textFields["Ask the diary…"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("what did the sleep expert say about caffeine?")
        app.buttons["Send question"].tap()
        // the mock answer always cites [1]
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'broken system'"))
            .firstMatch.waitForExistence(timeout: 30))
    }
}
