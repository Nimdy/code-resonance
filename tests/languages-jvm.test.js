'use strict';
// Java and Kotlin adapters (engine/languages/java.js, kotlin.js): types, members, Spring/JAX-RS/Ktor routes, text blocks
// and string templates, stable keys, and imports resolved by package folder (src/main/java beside src/main/kotlin).
const test=require('node:test'),assert=require('node:assert/strict');
const {list,invariants,project,analyze}=require('./languages-fixture');
const JAVA=String.raw`package com.acme.shop.web;

import com.acme.shop.model.User;
import com.acme.shop.model.Order.Line;
import static com.acme.shop.util.Strings.trim;
import com.acme.shop.service.*;
import java.util.List;
import java.util.Map;

/** class Fake { void ghost() {} } */
@RestController
@RequestMapping("/api/users")
public class UserController extends Base<User> implements Api {
    private static final String PREFIX = "{}";
    private final Map<String, List<Integer>> cache = new HashMap<>(), other;
    private int a, b = 2;
    private Runnable task = () -> { System.out.println("}"); };
    private Object anon = new Object() { public String toString() { return "x"; } };
    String text = """
        class Ghost { }
        """;

    static { init(); }

    public UserController(UserService service) { this.service = service; }

    @GetMapping("/{id}")
    public ResponseEntity<User> get(@PathVariable("id") long id) throws NotFound { return null; }

    @PostMapping(value = "/", produces = "application/json")
    public User create(@RequestBody User u) { return u; }

    @RequestMapping(path = "/search", method = RequestMethod.GET)
    public List<User> search(String q) { return List.of(); }

    @GetMapping
    public List<User> all() { return List.of(); }

    public <T extends Comparable<T>> T max(
            List<T> items,
            Comparator<? super T> cmp) {
        char c = '{';
        return null;
    }

    @Override
    public abstract void run();

    public record Page<T>(List<T> items, int total) implements Serializable {
        public Page { if (total < 0) throw new IllegalArgumentException(); }
        int size() { return items.size(); }
    }

    enum Role { ADMIN("a") { @Override String label() { return "A"; } }, USER("u");
        private final String code;
        Role(String code) { this.code = code; }
        String label() { return code; }
    }

    interface Hook { void fire(Event e); default int priority() { return 0; } int MAX = 3; }
    @interface Audited { String value() default ""; }
}

@Path("/legacy")
class LegacyResource {
    @GET
    @Path("/ping")
    public String ping() { return "pong"; }
}
`;
// Kotlin's ${...} templates and `backticked names` written with placeholders (this file is a JS template literal).
const KOTLIN=String.raw`package com.acme.shop.orders

import com.acme.shop.model.Order
import com.acme.shop.util.formatMoney
import com.acme.shop.db.*
import io.ktor.server.routing.get as ktorGet
import kotlinx.coroutines.flow.Flow

/* fun ghost() { /* nested */ } */
const val LIMIT = 10
val greeting = "Hello ‹ds›{user["name"]} } fun fake() {"
private val raw = """
    class Ghost { }
"""
typealias Handler = (Order) -> Unit

@RestController
@RequestMapping("/api/orders")
class OrderController(
    private val repo: OrderRepo,
    val clock: Clock,
    timeout: Int,
) : Base(timeout), Api {
    var count: Int = 0
        private set
    val cache by lazy { mutableMapOf<String, Order>() }
    lateinit var name: String

    @GetMapping("/{id}")
    fun get(@PathVariable id: Long): Order = repo.find(id)

    @PostMapping
    suspend fun create(@RequestBody o: Order): Order {
        val c = '{'
        return repo.save(o)
    }

    fun ‹bt›handles a test name‹bt›() {}

    companion object {
        const val VERSION = "1"
        fun create(): OrderController = TODO()
    }

    init { println("x") }

    constructor(repo: OrderRepo) : this(repo, Clock.systemUTC(), 1)
}

data class Line(val sku: String, val qty: Int = 1)
sealed interface Event
object Registry { val items = mutableListOf<Order>() }
enum class Status(val code: Int) { OPEN(1) { override fun x() = 1 }, CLOSED(2);
    fun label() = name.lowercase()
}
fun interface Callback { fun call(x: Int) }
annotation class Audited

fun <T> List<T>.second(): T = this[1]
fun String.isEmail(): Boolean {
    return contains("@")
}

fun Application.module() {
    routing {
        get("/health") { call.respondText("ok") }
        post("/orders") {
            call.respond(HttpStatusCode.Created)
        }
        route("/api") { get { } }
    }
}

interface Repo<T> {
    fun find(id: Long): T
    val size: Int
}
`.replace(/‹bt›/g,'\x60').replace(/‹ds›/g,'$');
test('Java: types, nested types, constructors, fields, records, enums, interfaces and Spring / JAX-RS routes',()=>{
  const r=analyze('src/main/java/com/acme/shop/web/UserController.java',JAVA);
  assert.deepEqual(list(r),['class UserController','property UserController.PREFIX','property UserController.cache','property UserController.other',
    'property UserController.a','property UserController.b','property UserController.task','property UserController.anon','property UserController.text',
    'method UserController.UserController','api.route UserController.GET /api/users/{id}','api.route UserController.POST /api/users/',
    'api.route UserController.GET /api/users/search','api.route UserController.GET /api/users','method UserController.max','method UserController.run',
    'class UserController.Page','property Page.items','property Page.total','method Page.size',
    'class UserController.Role','property Role.code','method Role.Role','method Role.label',
    'interface UserController.Hook','method Hook.fire','method Hook.priority','property Hook.MAX','interface UserController.Audited','method Audited.value',
    'class LegacyResource','api.route LegacyResource.GET /legacy/ping']);
  assert(!r.symbols.some(s=>/Fake|ghost|Ghost|toString/.test(s.name)),'javadoc, text blocks and anonymous classes add nothing');
  assert.equal(r.symbols.find(s=>s.name==='max').line,39,'a multi-line generic signature is one method');
});
test('Kotlin: classes, objects, primary-constructor properties, companions, extension functions, typealiases and routes',()=>{
  const r=analyze('src/main/kotlin/com/acme/shop/orders/Orders.kt',KOTLIN);
  assert.deepEqual(list(r),['variable LIMIT','variable greeting','variable raw','type Handler',
    'class OrderController','property OrderController.repo','property OrderController.clock','property OrderController.count','property OrderController.cache','property OrderController.name',
    'api.route OrderController.GET /api/orders/{id}','api.route OrderController.POST /api/orders','method OrderController.handles a test name',
    'property OrderController.VERSION','method OrderController.create','method OrderController.constructor',
    'class Line','property Line.sku','property Line.qty','interface Event','class Registry','property Registry.items',
    'class Status','property Status.code','method Status.label','interface Callback','method Callback.call','interface Audited',
    'method List.second','method String.isEmail','method Application.module','interface Repo','method Repo.find','property Repo.size',
    'api.route module.GET /health','api.route module.POST /orders']);
  assert(!r.symbols.some(s=>/fake|ghost|Ghost/.test(s.name)),'string templates with nested quotes and raw strings hide their text');
  assert.ok(!r.symbols.some(s=>s.name==='timeout'),'a constructor parameter without val/var is not a property');
});
test('Java and Kotlin: inserting lines changes no key; editing a body modifies exactly that symbol',()=>{
  // As in the TS adapter, a class's fingerprint covers its members: the enclosing classes change with the method.
  invariants('src/main/java/com/acme/shop/web/UserController.java',JAVA,{prefix:'// header\n\n',edit:['return items.size();','return 0;'],modified:['symbol.modified UserController','symbol.modified Page','symbol.modified size']});
  invariants('src/main/kotlin/com/acme/shop/orders/Orders.kt',KOTLIN,{prefix:'// header\n\n',edit:['return contains("@")','return false'],modified:['symbol.modified isEmail']});
});
test('Java and Kotlin: imports resolve by package folder, with Kotlin across src/main/java and to a package for top-level functions',()=>{
  const p=project({
    'src/main/java/com/acme/shop/model/User.java':'package com.acme.shop.model;\npublic class User {}\n',
    'src/main/java/com/acme/shop/model/Order.java':'package com.acme.shop.model;\npublic class Order { public static class Line {} }\n',
    'src/main/java/com/acme/shop/service/UserService.java':'package com.acme.shop.service;\npublic class UserService {}\n',
    'src/main/kotlin/com/acme/shop/util/Money.kt':'package com.acme.shop.util\nfun formatMoney(x: Long) = "$x"\n',
    'src/main/java/com/acme/shop/web/UserController.java':'package com.acme.shop.web;\nimport com.acme.shop.model.User;\nimport com.acme.shop.model.Order.Line;\nimport com.acme.shop.service.*;\nimport java.util.List;\npublic class UserController {}\n',
    'src/main/kotlin/com/acme/shop/orders/Orders.kt':'package com.acme.shop.orders\nimport com.acme.shop.model.User\nimport com.acme.shop.util.formatMoney\nimport kotlinx.coroutines.flow.Flow\nclass Orders\n',
    'src/test/java/com/acme/shop/UserTest.java':'package com.acme.shop;\nclass UserTest {}\n','src/commonTest/kotlin/OrdersTest.kt':'class OrdersTest\n'
  },{salt:'jvm'});
  assert.deepEqual(p.edges('src/main/java/com/acme/shop/web/UserController.java'),['src/main/java/com/acme/shop/model/Order.java','src/main/java/com/acme/shop/model/User.java','src/main/java/com/acme/shop/service/UserService.java']);
  assert.deepEqual(p.edges('src/main/kotlin/com/acme/shop/orders/Orders.kt'),['src/main/java/com/acme/shop/model/User.java','src/main/kotlin/com/acme/shop/util/Money.kt']);
  assert.equal(p.node('src/test/java/com/acme/shop/UserTest.java').test,true);assert.equal(p.node('src/commonTest/kotlin/OrdersTest.kt').test,true);
  assert.equal(p.node('src/main/kotlin/com/acme/shop/util/Money.kt').test,false);
  assert.deepEqual([p.node('src/main/java/com/acme/shop/model/User.java').lang,p.node('src/main/kotlin/com/acme/shop/util/Money.kt').lang],['java','kt']);
  // A Java file whose folder does not spell its package resolves nothing (no guess).
  assert.equal(analyze('lib/Foo.java','package com.acme;\nimport com.acme.Bar;\nclass Foo {}\n').imports[0].candidate,undefined);
});
