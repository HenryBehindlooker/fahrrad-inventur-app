import SwiftUI
import WebKit

/// SwiftUI-Wrapper um den WKWebView, in dem die Web-App läuft.
struct WebAppView: UIViewRepresentable {
    func makeCoordinator() -> NativeBridge {
        NativeBridge()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Persistenter Speicher: IndexedDB-Daten bleiben über App-Neustarts erhalten.
        config.websiteDataStore = .default()
        config.setURLSchemeHandler(AppSchemeHandler(), forURLScheme: AppSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true

        // JS -> Swift: window.webkit.messageHandlers.native.postMessage({ action: … })
        let contentController = WKUserContentController()
        contentController.add(WeakScriptMessageHandler(context.coordinator), name: "native")
        config.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true // Safari > Entwickler > Gerät zum Debuggen
        }
        #endif

        context.coordinator.webView = webView
        webView.load(URLRequest(url: AppConfig.startURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// Verhindert einen Retain-Cycle (WKUserContentController hält Handler stark).
@MainActor
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
