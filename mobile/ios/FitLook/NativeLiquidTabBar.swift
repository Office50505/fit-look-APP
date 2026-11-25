import UIKit
import React

private struct NativeLiquidTabItemConfiguration {
  let title: String
  let symbol: String
  let route: String
  let transient: Bool
  let enabled: Bool

  init?(dictionary: NSDictionary) {
    guard
      let title = dictionary["title"] as? String,
      let symbol = dictionary["symbol"] as? String,
      let route = dictionary["route"] as? String
    else { return nil }

    self.title = title
    self.symbol = symbol
    self.route = route
    self.transient = (dictionary["transient"] as? NSNumber)?.boolValue ?? false
    self.enabled = (dictionary["enabled"] as? NSNumber)?.boolValue ?? true
  }
}

@objc(NativeLiquidTabBarView)
final class NativeLiquidTabBarView: UIView, UITabBarControllerDelegate, UIGestureRecognizerDelegate {
  @objc var onSelect: RCTDirectEventBlock?

  @objc var items: NSArray = [] {
    didSet { applyItemsIfNeeded() }
  }

  @objc var selectedIndex: NSNumber = 0 {
    didSet { applySelectedIndex() }
  }

  @objc var barHidden: Bool = false {
    didSet { applyVisibility(animated: window != nil) }
  }

  private let tabController = UITabBarController()
  private let overlayContainer = UIView()
  private let overlayHeight: CGFloat = 132
  private weak var hostingViewController: UIViewController?
  private var configurations: [NativeLiquidTabItemConfiguration] = []
  private var configurationSignature = ""
  private var isApplyingSelection = false
  private lazy var tabDragRecognizer: UIPanGestureRecognizer = {
    let recognizer = UIPanGestureRecognizer(target: self, action: #selector(handleTabDrag(_:)))
    // A drag that starts on the floating bar belongs to the bar, not to the
    // horizontal React Native pager underneath it.
    recognizer.cancelsTouchesInView = true
    recognizer.delaysTouchesBegan = false
    recognizer.delaysTouchesEnded = false
    recognizer.maximumNumberOfTouches = 1
    recognizer.requiresExclusiveTouchType = true
    recognizer.delegate = self
    return recognizer
  }()
  private lazy var tabTapRecognizer: UITapGestureRecognizer = {
    let recognizer = UITapGestureRecognizer(target: self, action: #selector(handleTabTap(_:)))
    recognizer.cancelsTouchesInView = false
    recognizer.delaysTouchesBegan = false
    recognizer.delaysTouchesEnded = false
    recognizer.numberOfTapsRequired = 1
    recognizer.delegate = self
    return recognizer
  }()
  private let selectionFeedback = UISelectionFeedbackGenerator()
  private var dragOriginIndex: Int?
  private var dragCandidateIndex: Int?
  private var isCompletingDrag = false
  private var lastUIKitSelectionIndex: Int?
  private var lastUIKitSelectionTime: CFTimeInterval = 0
  private let selectedItemColor = UIColor(red: 0.075, green: 0.065, blue: 0.060, alpha: 1)
  private let unselectedItemColor = UIColor(red: 0.61, green: 0.34, blue: 0.35, alpha: 0.92)

  override init(frame: CGRect) {
    super.init(frame: frame)
    isOpaque = false
    backgroundColor = .clear
    clipsToBounds = false
    accessibilityViewIsModal = false
    configureController()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    isOpaque = false
    backgroundColor = .clear
    clipsToBounds = false
    accessibilityViewIsModal = false
    configureController()
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    detachController()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detachController()
    } else {
      attachControllerIfNeeded()
      applyVisibility(animated: false)
    }
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    if superview != nil { attachControllerIfNeeded() }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    attachControllerIfNeeded()
    layoutOverlay()
  }

  private func layoutOverlay() {
    guard let parent = hostingViewController, overlayContainer.superview === parent.view else { return }
    let parentBounds = parent.view.bounds
    overlayContainer.frame = CGRect(
      x: 0,
      y: max(0, parentBounds.height - overlayHeight),
      width: parentBounds.width,
      height: min(overlayHeight, parentBounds.height)
    )
    tabController.view.frame = overlayContainer.bounds
    tabController.view.backgroundColor = .clear
    tabController.view.isOpaque = false
    tabController.view.clipsToBounds = false
    tabController.tabBar.clipsToBounds = false

    // UITabBarController owns private content and glass hosts. Keep them clear,
    // but do not disable interaction on any of them: iOS 26 can place parts of
    // the floating tab controls in sibling containers rather than below the
    // public UITabBar node.
    for subview in tabController.view.subviews where subview !== tabController.tabBar {
      subview.backgroundColor = .clear
      subview.isOpaque = false
    }

    // iOS 26 may wrap the floating tab bar in a private container. Never turn
    // that ancestor off: the glass can still render while every control inside
    // it becomes untouchable. Keep the complete tab-bar branch interactive.
    var tabBarAncestor = tabController.tabBar.superview
    while let ancestor = tabBarAncestor, ancestor !== tabController.view {
      ancestor.isUserInteractionEnabled = true
      ancestor.clipsToBounds = false
      tabBarAncestor = ancestor.superview
    }
    tabController.view.isUserInteractionEnabled = true
    tabController.tabBar.isUserInteractionEnabled = true
    tabController.tabBar.superview?.bringSubviewToFront(tabController.tabBar)
    overlayContainer.isUserInteractionEnabled = !barHidden
    overlayContainer.isHidden = false
    parent.view.bringSubviewToFront(overlayContainer)
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    // The React-managed view is lifecycle/configuration only. The actual bar
    // lives in overlayContainer above the React pager, so this full-screen host
    // must never enter React Native's hit-test chain.
    return false
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    return nil
  }

  private func configureController() {
    tabController.delegate = self
    tabController.view.backgroundColor = .clear
    tabController.view.isOpaque = false
    tabController.view.clipsToBounds = false
    // Match Lookmefy's warm cream/black palette while UIKit continues to own
    // the Liquid Glass material, refraction and selected lens rendering.
    tabController.overrideUserInterfaceStyle = .light
    tabController.tabBar.overrideUserInterfaceStyle = .light
    tabController.tabBar.isTranslucent = true
    tabController.tabBar.tintColor = selectedItemColor
    tabController.tabBar.unselectedItemTintColor = unselectedItemColor
    applyItemColorAppearance()
    tabController.tabBar.itemPositioning = .fill
    tabController.tabBar.clipsToBounds = false
    overlayContainer.backgroundColor = .clear
    overlayContainer.isOpaque = false
    overlayContainer.clipsToBounds = false
    overlayContainer.layer.zPosition = 10_000
    overlayContainer.accessibilityViewIsModal = false
    tabController.tabBar.addGestureRecognizer(tabDragRecognizer)
    tabController.tabBar.addGestureRecognizer(tabTapRecognizer)
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(updateDragAccessibilityState),
      name: UIAccessibility.voiceOverStatusDidChangeNotification,
      object: nil
    )
    updateDragAccessibilityState()
    if #available(iOS 18.0, *) {
      tabController.mode = .tabBar
    }
    if #available(iOS 26.0, *) {
      tabController.tabBarMinimizeBehavior = .never
    }
  }

  private func applyItemColorAppearance() {
    let appearance = tabController.tabBar.standardAppearance.copy()
    let itemAppearances = [
      appearance.stackedLayoutAppearance,
      appearance.inlineLayoutAppearance,
      appearance.compactInlineLayoutAppearance
    ]
    for itemAppearance in itemAppearances {
      itemAppearance.normal.iconColor = unselectedItemColor
      itemAppearance.normal.titleTextAttributes = [.foregroundColor: unselectedItemColor]
      itemAppearance.selected.iconColor = selectedItemColor
      itemAppearance.selected.titleTextAttributes = [.foregroundColor: selectedItemColor]
    }
    tabController.tabBar.standardAppearance = appearance
    tabController.tabBar.scrollEdgeAppearance = appearance
  }

  private func attachControllerIfNeeded() {
    guard window != nil else { return }
    guard let parent = nearestViewController() else { return }
    if let currentParent = tabController.parent, currentParent !== parent {
      detachController()
    }
    guard tabController.parent == nil else {
      layoutOverlay()
      return
    }
    hostingViewController = parent
    parent.addChild(tabController)
    overlayContainer.frame = CGRect(
      x: 0,
      y: max(0, parent.view.bounds.height - overlayHeight),
      width: parent.view.bounds.width,
      height: min(overlayHeight, parent.view.bounds.height)
    )
    overlayContainer.autoresizingMask = [.flexibleWidth, .flexibleTopMargin]
    parent.view.addSubview(overlayContainer)
    tabController.view.frame = overlayContainer.bounds
    tabController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlayContainer.addSubview(tabController.view)
    tabController.didMove(toParent: parent)
    layoutOverlay()
  }

  private func detachController() {
    guard tabController.parent != nil else { return }
    tabController.willMove(toParent: nil)
    tabController.view.removeFromSuperview()
    overlayContainer.removeFromSuperview()
    tabController.removeFromParent()
    hostingViewController = nil
  }

  private func nearestViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }

  private func applyItemsIfNeeded() {
    let nextConfigurations = items.compactMap { value -> NativeLiquidTabItemConfiguration? in
      guard let dictionary = value as? NSDictionary else { return nil }
      return NativeLiquidTabItemConfiguration(dictionary: dictionary)
    }
    let nextSignature = nextConfigurations.map {
      "\($0.title)|\($0.symbol)|\($0.route)|\($0.transient)|\($0.enabled)"
    }.joined(separator: ";")
    guard nextSignature != configurationSignature else {
      applySelectedIndex()
      return
    }

    configurationSignature = nextSignature
    configurations = nextConfigurations
    let controllers = nextConfigurations.map { configuration -> UIViewController in
      let controller = UIViewController()
      controller.view.backgroundColor = .clear
      controller.view.isOpaque = false
      controller.view.isUserInteractionEnabled = false
      let symbolImage = UIImage(systemName: configuration.symbol)
      let normalImage = symbolImage?.withTintColor(unselectedItemColor, renderingMode: .alwaysOriginal)
      let selectedImage = symbolImage?.withTintColor(selectedItemColor, renderingMode: .alwaysOriginal)
      controller.tabBarItem = UITabBarItem(
        title: configuration.title,
        image: normalImage,
        selectedImage: selectedImage
      )
      controller.tabBarItem.setTitleTextAttributes(
        [.foregroundColor: unselectedItemColor],
        for: .normal
      )
      controller.tabBarItem.setTitleTextAttributes(
        [.foregroundColor: selectedItemColor],
        for: .selected
      )
      controller.tabBarItem.accessibilityLabel = configuration.title
      return controller
    }
    tabController.setViewControllers(controllers, animated: false)
    applyItemColorAppearance()
    applySelectedIndex()
    setNeedsLayout()
  }

  private func applySelectedIndex() {
    guard !configurations.isEmpty else { return }
    let index = min(max(selectedIndex.intValue, 0), configurations.count - 1)
    guard tabController.selectedIndex != index else { return }
    isApplyingSelection = true
    tabController.selectedIndex = index
    isApplyingSelection = false
  }

  private func applyVisibility(animated: Bool) {
    if #available(iOS 26.0, *) {
      tabController.setTabBarHidden(barHidden, animated: animated)
    } else {
      tabController.tabBar.isHidden = barHidden
    }
    overlayContainer.isUserInteractionEnabled = !barHidden
  }

  private func emitSelection(index: Int, configuration: NativeLiquidTabItemConfiguration) {
    onSelect?([
      "index": index,
      "route": configuration.route,
      "transient": configuration.transient,
      "enabled": configuration.enabled
    ])
  }

  @objc private func updateDragAccessibilityState() {
    // VoiceOver supplies its own explore-by-touch and activation model. Keep
    // UIKit's standard tab behavior in full control while it is running.
    tabDragRecognizer.isEnabled = !UIAccessibility.isVoiceOverRunning
  }

  private func tabIndex(at location: CGPoint) -> Int? {
    guard !configurations.isEmpty, tabController.tabBar.bounds.width > 0 else { return nil }
    let normalizedX = min(max(location.x, 0), tabController.tabBar.bounds.width - 0.001)
    let rawIndex = Int((normalizedX / tabController.tabBar.bounds.width) * CGFloat(configurations.count))
    return min(max(rawIndex, 0), configurations.count - 1)
  }

  private func displayDragCandidate(_ index: Int) {
    guard configurations.indices.contains(index), dragCandidateIndex != index else { return }
    dragCandidateIndex = index
    isApplyingSelection = true
    tabController.selectedIndex = index
    isApplyingSelection = false
    selectionFeedback.selectionChanged()
    selectionFeedback.prepare()
  }

  @objc private func handleTabDrag(_ recognizer: UIPanGestureRecognizer) {
    let location = recognizer.location(in: tabController.tabBar)
    switch recognizer.state {
    case .began:
      dragOriginIndex = tabController.selectedIndex
      dragCandidateIndex = tabController.selectedIndex
      selectionFeedback.prepare()
      if let index = tabIndex(at: location) { displayDragCandidate(index) }
    case .changed:
      if let index = tabIndex(at: location) { displayDragCandidate(index) }
    case .ended:
      completeTabDrag(commit: true)
    case .cancelled, .failed:
      completeTabDrag(commit: false)
    default:
      break
    }
  }

  @objc private func handleTabTap(_ recognizer: UITapGestureRecognizer) {
    guard recognizer.state == .ended else { return }
    let location = recognizer.location(in: tabController.tabBar)
    guard let index = tabIndex(at: location), configurations.indices.contains(index) else { return }

    // UIKit's own control action normally wins. On iOS 26 embedded React Native
    // hosts can occasionally render the glass controls without delivering that
    // action; defer one run-loop turn and only provide the missing activation.
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      let nativeHandledThisTap = self.lastUIKitSelectionIndex == index
        && CACurrentMediaTime() - self.lastUIKitSelectionTime < 0.25
      guard !nativeHandledThisTap else { return }
      self.activateTab(at: index)
    }
  }

  private func activateTab(at index: Int) {
    guard configurations.indices.contains(index) else { return }
    let configuration = configurations[index]
    if configuration.transient || !configuration.enabled {
      emitSelection(index: index, configuration: configuration)
      return
    }

    if tabController.selectedIndex != index {
      isApplyingSelection = true
      tabController.selectedIndex = index
      isApplyingSelection = false
      selectionFeedback.selectionChanged()
    }
    emitSelection(index: index, configuration: configuration)
  }

  private func completeTabDrag(commit: Bool) {
    guard let originIndex = dragOriginIndex else { return }
    let candidateIndex = dragCandidateIndex ?? originIndex
    let configuration = configurations.indices.contains(candidateIndex)
      ? configurations[candidateIndex]
      : nil
    let shouldCommitRootTab = commit
      && configuration?.transient == false
      && configuration?.enabled == true
    let finalVisualIndex = shouldCommitRootTab ? candidateIndex : originIndex

    isCompletingDrag = true
    isApplyingSelection = true
    tabController.selectedIndex = finalVisualIndex
    isApplyingSelection = false

    if commit, let configuration {
      emitSelection(index: candidateIndex, configuration: configuration)
    }

    dragOriginIndex = nil
    dragCandidateIndex = nil

    // UITabBar may finish its own control tracking after the pan callback.
    // Reassert the winning selection on the next main-loop turn so an
    // interrupted or rapid drag cannot resurrect the touch-down item.
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.isApplyingSelection = true
      self.tabController.selectedIndex = finalVisualIndex
      self.isApplyingSelection = false
      self.isCompletingDrag = false
    }
  }

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard !barHidden,
      configurations.count > 1,
      !UIAccessibility.isVoiceOverRunning
    else { return false }
    if gestureRecognizer === tabTapRecognizer { return true }
    guard gestureRecognizer === tabDragRecognizer else { return false }
    let velocity = tabDragRecognizer.velocity(in: tabController.tabBar)
    return abs(velocity.x) >= abs(velocity.y)
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    // Never let the root pager consume a navbar drag at the same time. The tap
    // observer may coexist with UIKit's private tab-button recognizers so it
    // remains a no-op fallback when UIKit handles the activation itself.
    if gestureRecognizer === tabDragRecognizer || otherGestureRecognizer === tabDragRecognizer {
      return false
    }
    return gestureRecognizer === tabTapRecognizer
      || otherGestureRecognizer === tabTapRecognizer
  }

  func tabBarController(
    _ tabBarController: UITabBarController,
    shouldSelect viewController: UIViewController
  ) -> Bool {
    guard
      let index = tabBarController.viewControllers?.firstIndex(of: viewController),
      configurations.indices.contains(index)
    else { return false }
    let configuration = configurations[index]
    lastUIKitSelectionIndex = index
    lastUIKitSelectionTime = CACurrentMediaTime()
    if configuration.transient || !configuration.enabled {
      emitSelection(index: index, configuration: configuration)
      return false
    }
    return true
  }

  func tabBarController(
    _ tabBarController: UITabBarController,
    didSelect viewController: UIViewController
  ) {
    guard !isApplyingSelection, !isCompletingDrag, dragOriginIndex == nil,
      let index = tabBarController.viewControllers?.firstIndex(of: viewController),
      configurations.indices.contains(index)
    else { return }
    lastUIKitSelectionIndex = index
    lastUIKitSelectionTime = CACurrentMediaTime()
    emitSelection(index: index, configuration: configurations[index])
  }
}

@objc(NativeLiquidTabBarManager)
final class NativeLiquidTabBarManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }

  override func view() -> UIView! {
    NativeLiquidTabBarView()
  }
}
