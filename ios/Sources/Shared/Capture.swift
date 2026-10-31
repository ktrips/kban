import Foundation

enum Config {
    static let baseURL = URL(string: "https://kban.ktrips.net")!
    static let group = "group.net.ktrips.kban"
}

/// アプリと共有シートで共有する設定(App Group)。トークンは kban で再発行すれば無効にできる。
enum Shared {
    static var defaults: UserDefaults { UserDefaults(suiteName: Config.group) ?? .standard }
    static var token: String? {
        get { defaults.string(forKey: "captureToken") }
        set { defaults.set(newValue, forKey: "captureToken") }
    }
    static var webLoggedIn: Bool {
        get { defaults.bool(forKey: "webLoggedIn") }
        set { defaults.set(newValue, forKey: "webLoggedIn") }
    }
}

struct Target: Codable, Hashable, Identifiable {
    let board: String
    let boardName: String
    let repo: String
    let name: String
    var id: String { board + "|" + repo }
}

struct Targets: Codable {
    struct Last: Codable { let board: String; let repo: String }
    let targets: [Target]
    let last: Last?
}

struct CaptureError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// kban の /api/capture を呼ぶ。1回の送信でメモ+スクリーンショットがバックログに入る。
enum CaptureAPI {
    private static func request(_ path: String, method: String) throws -> URLRequest {
        guard let token = Shared.token else { throw CaptureError(message: "kban アプリを開いてログインしてください") }
        var r = URLRequest(url: Config.baseURL.appendingPathComponent(path))
        r.httpMethod = method
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.timeoutInterval = 60
        return r
    }

    private static func check(_ data: Data, _ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse, http.statusCode >= 400 else { return }
        let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
        throw CaptureError(message: msg ?? "送信に失敗しました (HTTP \(http.statusCode))")
    }

    static func targets() async throws -> Targets {
        let (data, res) = try await URLSession.shared.data(for: request("api/capture", method: "GET"))
        try check(data, res)
        return try JSONDecoder().decode(Targets.self, from: data)
    }

    static func send(memo: String, images: [Data], to target: Target?) async throws {
        var req = try request("api/capture", method: "POST")
        let boundary = "kban-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
        }
        field("memo", memo)
        if let t = target { field("board", t.board); field("repo", t.repo) }
        for (i, img) in images.enumerated() {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"images\"; filename=\"shot-\(i + 1).jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
            body.append(img)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        let (data, res) = try await URLSession.shared.upload(for: req, from: body)
        try check(data, res)
    }
}
