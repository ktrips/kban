import SwiftUI
import WebKit
import AuthenticationServices

@main
struct KbanApp: App {
    var body: some Scene {
        WindowGroup { ContentView().ignoresSafeArea(.container, edges: .bottom) }
    }
}

struct ContentView: View {
    @State private var webURL: URL? = Shared.webLoggedIn ? Config.baseURL : nil
    @State private var error: String?
    @StateObject private var login = Login()

    var body: some View {
        if let url = webURL {
            WebView(url: url, onLoginNeeded: {
                // Web 側のセッションが切れた。Google は WebView でのログインを拒否するので、ネイティブでやり直す。
                Shared.webLoggedIn = false
                webURL = nil
            })
        } else {
            VStack(spacing: 20) {
                Text("kban").font(.largeTitle.bold())
                Text("リポジトリごとのバックログから、AIで実装・テスト・デプロイ・確認まで").multilineTextAlignment(.center).foregroundStyle(.secondary)
                Button("Google でログイン") { Task { await signIn() } }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }
            .padding(32)
        }
    }

    private func signIn() async {
        do {
            let r = try await login.start()
            Shared.token = r.token // 共有シート用
            Shared.webLoggedIn = true
            var c = URLComponents(url: Config.baseURL.appendingPathComponent("api/native/exchange"), resolvingAgainstBaseURL: false)!
            c.queryItems = [URLQueryItem(name: "code", value: r.code)]
            error = nil
            webURL = c.url
        } catch let e as ASWebAuthenticationSessionError where e.code == .canceledLogin {
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// ASWebAuthenticationSession で /api/native/start を開き、kban://done?code=…&token=… を受け取る。
@MainActor
final class Login: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func start() async throws -> (code: String, token: String) {
        try await withCheckedThrowingContinuation { cont in
            let s = ASWebAuthenticationSession(url: Config.baseURL.appendingPathComponent("api/native/start"), callbackURLScheme: "kban") { url, error in
                if let error { cont.resume(throwing: error); return }
                let items = URLComponents(url: url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
                func v(_ n: String) -> String? { items.first { $0.name == n }?.value }
                if let code = v("code"), let token = v("token") { cont.resume(returning: (code, token)) }
                else { cont.resume(throwing: CaptureError(message: "ログイン結果を読めませんでした")) }
            }
            s.presentationContextProvider = self
            s.prefersEphemeralWebBrowserSession = false
            self.session = s
            s.start()
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
}

struct WebView: UIViewRepresentable {
    let url: URL
    var onLoginNeeded: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onLoginNeeded) }

    func makeUIView(context: Context) -> WKWebView {
        let w = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        w.navigationDelegate = context.coordinator
        w.allowsBackForwardNavigationGestures = true
        context.coordinator.loaded = url
        w.load(URLRequest(url: url))
        return w
    }

    func updateUIView(_ w: WKWebView, context: Context) {
        if context.coordinator.loaded != url { context.coordinator.loaded = url; w.load(URLRequest(url: url)) }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var loaded: URL?
        let onLoginNeeded: () -> Void
        init(_ f: @escaping () -> Void) { onLoginNeeded = f }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let u = action.request.url else { return decisionHandler(.allow) }
            if u.host == Config.baseURL.host {
                if u.path == "/login" { decisionHandler(.cancel); onLoginNeeded(); return }
                return decisionHandler(.allow)
            }
            // GitHub など外部サイトは Safari で開く
            if action.navigationType == .linkActivated { UIApplication.shared.open(u); return decisionHandler(.cancel) }
            decisionHandler(.allow)
        }
    }
}
