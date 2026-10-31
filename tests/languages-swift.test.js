'use strict';
// Swift adapter (engine/languages/swift.js): types, protocols, extensions owning their members, properties, Vapor
// routes, interpolation with nested strings, raw strings, #if branches, stable keys, and Swift package modules.
const test=require('node:test'),assert=require('node:assert/strict');
const {list,invariants,project,analyze}=require('./languages-fixture');
const SWIFT=String.raw`import Foundation
@testable import ShopCore
import struct Vapor.Request

/* class Ghost { /* nested */ } */
let limit = 10
var greeting = "Hello \(user["name"]) } func fake() {"
let raw = #"class Raw { "quoted" }"#
let multi = """
    struct Ghost { }
    """
typealias Handler = (Order) -> Void

@MainActor
public final class OrderStore: ObservableObject {
    @Published private(set) var orders: [Order] = []
    let repo: OrderRepo
    var count: Int { orders.count }
    lazy var cache: [String: Order] = [:]
    static let shared = OrderStore(repo: .live)

    init(repo: OrderRepo) { self.repo = repo }
    convenience init?(name: String) { return nil }
    deinit { }

    func load() async throws { orders = try await repo.all() }
    @discardableResult
    public func add(_ order: Order) -> Bool { orders.append(order); return true }
    static func == (lhs: OrderStore, rhs: OrderStore) -> Bool { true }
    func generic<T: Codable>(_ value: T) -> T where T: Equatable { value }
}

struct Order: Codable, Identifiable {
    let id: UUID
    var lines: [Line]
    enum Status: String { case open, closed }
}
enum Shape { case circle(Double), square(Double)
    var area: Double { switch self { case .circle(let r): return r * r; case .square(let s): return s * s } }
}
protocol OrderRepo {
    func all() async throws -> [Order]
    var name: String { get }
}
actor Counter { var value = 0; func increment() { value += 1 } }
extension Order: Equatable {
    static func == (a: Order, b: Order) -> Bool { a.id == b.id }
    var total: Double { 0 }
}
#if os(iOS)
func onlyIOS() { }
#else
func notIOS() { }
#endif

func routes(_ app: Application) throws {
    app.get("hello") { req in "Hello" }
    app.get("users", ":id") { req -> String in "user" }
    app.post("orders", use: create)
    let x = dict.get("key")
}
`;
test('Swift: classes, structs, enums, actors, protocols, extensions, initializers, properties and Vapor routes',()=>{
  const r=analyze('Sources/App/Orders.swift',SWIFT);
  assert.deepEqual(list(r),['variable limit','variable greeting','variable raw','variable multi','type Handler',
    'class OrderStore','property OrderStore.orders','property OrderStore.repo','property OrderStore.count','property OrderStore.cache','property OrderStore.shared',
    'method OrderStore.init','method OrderStore.init','method OrderStore.load','method OrderStore.add','method OrderStore.==','method OrderStore.generic',
    'class Order','property Order.id','property Order.lines','class Order.Status','class Shape','property Shape.area',
    'interface OrderRepo','method OrderRepo.all','property OrderRepo.name','class Counter','property Counter.value','method Counter.increment',
    'method Order.==','property Order.total','function onlyIOS','function notIOS','function routes',
    'api.route routes.GET /hello','api.route routes.GET /users/:id','api.route routes.POST /orders']);
  assert(!r.symbols.some(s=>/Ghost|Raw|fake/.test(s.name)),'interpolation, raw and multi-line strings and nested comments hide their text');
  // Both branches of `#if os(iOS) ... #else ... #endif` are brace-balanced, so both are read.
  assert.equal(analyze('a.swift','#if DEBUG\nfunc f() {\n#else\nfunc f(x: Int) {\n#endif\n}\nfunc g() {}\n').symbols.map(s=>s.name).join(),'f,g','unbalanced alternatives: the first branch only');
});
test('Swift: inserting lines changes no key; editing a body modifies exactly that symbol',()=>{
  invariants('Sources/App/Orders.swift',SWIFT,{prefix:'// header\n\n',edit:['func increment() { value += 1 }','func increment() { value += 2 }'],modified:['symbol.modified Counter','symbol.modified increment']});
});
test('Swift: import Module resolves to a file of Sources/Module in a Swift package; Tests/ is validation',()=>{
  const p=project({
    'Sources/ShopCore/Order.swift':'public struct Order {}\n','Sources/ShopCore/ShopCore.swift':'public enum ShopCore {}\n',
    'Sources/App/routes.swift':'import Vapor\nimport ShopCore\nfunc routes(_ app: Application) throws {}\n',
    'Tests/AppTests/RoutesTests.swift':'@testable import App\nimport XCTest\nfinal class RoutesTests: XCTestCase {}\n'
  },{salt:'swift'});
  assert.deepEqual(p.edges('Sources/App/routes.swift'),['Sources/ShopCore/ShopCore.swift']);
  assert.equal(p.node('Tests/AppTests/RoutesTests.swift').test,true);assert.equal(p.node('Sources/App/routes.swift').lang,'swift');
});
