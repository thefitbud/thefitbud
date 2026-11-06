# Local Expo module: start/update/end the FitBud workout Live Activity (LA1).
Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '0.0.0'
  s.summary        = 'FitBud workout Live Activity bridge (local updates only)'
  s.description    = 'Starts, updates and ends the FitBudWorkoutAttributes Live Activity from JS. No push.'
  s.author         = 'FitBud'
  s.homepage       = 'https://thefitbud.com'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  # The app still supports iOS 15.1, where ActivityKit does not exist.
  s.weak_frameworks = 'ActivityKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
