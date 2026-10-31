'use strict';
// C# adapter (engine/languages/csharp.js): types, members, ASP.NET attribute and minimal-API routes, verbatim and
// interpolated strings, #if branches, stable keys, and namespaces as candidate folders.
const test=require('node:test'),assert=require('node:assert/strict');
const {list,invariants,project,analyze}=require('./languages-fixture');
const CS=String.raw`using System;
using System.Collections.Generic;
using Acme.Shop.Services;
using static Acme.Shop.Util.Strings;
using Models = Acme.Shop.Models;
global using Acme.Shop.Core;

namespace Acme.Shop.Web.Controllers
{
    #region Controllers
    /// <summary>class Ghost { }</summary>
    [ApiController]
    [Route("api/[controller]")]
    public sealed class UsersController : ControllerBase, IDisposable
    {
        private readonly IUserService _service;
        private readonly Dictionary<string, List<int>> _cache = new(), _other;
        public const int Limit = 10;
        public event EventHandler<UserEventArgs> Changed;
        public string Name { get; set; } = "x";
        public int Count => _cache.Count;
        public int this[int i] { get { return i; } }
        private Func<int, int> _square = x => { return x * x; };
        private string _path = @"C:\temp\" + $"{_cache["a"]} }}";

        public UsersController(IUserService service) : base() { _service = service; }
        ~UsersController() { }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<User>> Get(int id, CancellationToken ct = default) { return null; }

        [HttpPost]
        public IActionResult Create([FromBody] User user) => Ok(user);

        [HttpDelete("/admin/users/{id}")]
        public IActionResult Delete(int id) { return NoContent(); }

        [Route("search")]
        [HttpGet]
        public IEnumerable<User> Search<T>(string q) where T : class { yield break; }

        public static UsersController operator +(UsersController a, UsersController b) => a;
        public void Dispose() { }

#if DEBUG
        public void Debug() {
#else
        public void Debug(int level) {
#endif
        }

        private enum Mode { Fast = 1, Slow }
        public record Page(int Number, IReadOnlyList<User> Items);
        public interface IHook { void Fire(); string Label { get; } }
    }
    #endregion
}

public delegate void Notify(string message);
public record struct Point(int X, int Y);
`;
const PROGRAM=String.raw`var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.MapGet("/health", () => "ok");
app.MapPost("/orders", async (Order o, Db db) => { await db.SaveAsync(o); return Results.Created(); });
var group = app.MapGroup("/api");
group.MapDelete("items/{id}", (int id) => Results.NoContent());
app.Run();
`;
test('C#: classes, records, interfaces, enums, delegates, members, attribute routes and minimal APIs',()=>{
  const r=analyze('src/Web/Controllers/UsersController.cs',CS);
  assert.deepEqual(list(r),['class UsersController','property UsersController._service','property UsersController._cache','property UsersController._other',
    'property UsersController.Limit','property UsersController.Changed','property UsersController.Name','property UsersController.Count',
    'property UsersController._square','property UsersController._path','method UsersController.UsersController','method UsersController.~UsersController',
    'api.route UsersController.GET api/Users/{id:int}','api.route UsersController.POST api/Users','api.route UsersController.DELETE /admin/users/{id}',
    'api.route UsersController.GET api/Users/search','method UsersController.operator+','method UsersController.Dispose','method UsersController.Debug',
    'class UsersController.Mode','class UsersController.Page','property Page.Number','property Page.Items',
    'interface UsersController.IHook','method IHook.Fire','property IHook.Label','type Notify','class Point','property Point.X','property Point.Y']);
  assert(!r.symbols.some(s=>s.name==='Ghost'),'XML doc comments and #region lines add nothing');
  assert.equal(r.symbols.filter(s=>s.name==='Debug').length,1,'#if/#else alternatives that open a body keep the first');
  assert.deepEqual(list(analyze('src/Web/Program.cs',PROGRAM)),['api.route GET /health','api.route POST /orders','api.route DELETE /items/{id}']);
});
test('C#: inserting lines changes no key; editing a body modifies exactly that symbol',()=>{
  invariants('src/Web/Controllers/UsersController.cs',CS,{prefix:'// header\n\n',edit:['public void Dispose() { }','public void Dispose() { _cache.Clear(); }'],modified:['symbol.modified UsersController','symbol.modified Dispose']});
});
test('C#: a using is a candidate folder below the root namespace, resolved only when that folder exists',()=>{
  const p=project({
    'src/Services/UserService.cs':'namespace Acme.Shop.Services;\npublic class UserService {}\n',
    'src/Services/IUserService.cs':'namespace Acme.Shop.Services;\npublic interface IUserService {}\n',
    'src/Web/Controllers/UsersController.cs':'using System;\nusing Acme.Shop.Services;\nusing Acme.Shop.Missing;\nnamespace Acme.Shop.Web.Controllers\n{\n  public class UsersController {}\n}\n',
    'tests/Shop.Tests/UserServiceTests.cs':'public class UserServiceTests {}\n','src/Shop.Tests/Helpers.cs':'class Helpers {}\n'
  },{salt:'cs'});
  assert.deepEqual(p.edges('src/Web/Controllers/UsersController.cs'),['src/Services/IUserService.cs'],'the first file in path order stands for the namespace folder');
  assert.equal(p.node('tests/Shop.Tests/UserServiceTests.cs').test,true);assert.equal(p.node('src/Shop.Tests/Helpers.cs').test,true);
  assert.equal(p.node('src/Services/UserService.cs').test,false);assert.equal(p.node('src/Services/UserService.cs').lang,'cs');
});
