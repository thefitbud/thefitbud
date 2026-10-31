import SwiftUI
import WidgetKit

/// Entry point of the FitBudLiveActivity widget extension (LA1). A widget
/// target needs exactly one @main; the widget itself lives in
/// FitBudLiveActivity.swift.
@main
struct FitBudLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    FitBudLiveActivityWidget()
  }
}
