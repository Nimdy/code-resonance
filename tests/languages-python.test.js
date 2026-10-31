'use strict';
// Deeper Python (interpretation 10): Protocol/ABC interfaces, TypedDict / TypeAlias / type / NewType types, Django
// urls, Flask/FastAPI/Starlette registered routes, routes inside an app factory; and test-file conventions.
const test=require('node:test'),assert=require('node:assert/strict');
const {list,invariants,project,analyze}=require('./languages-fixture');
const URLS=String.raw`from __future__ import annotations
from typing import TYPE_CHECKING, Protocol, TypedDict, TypeAlias, NewType
from abc import ABC, abstractmethod
from django.urls import path, re_path, include
from . import views
if TYPE_CHECKING:
    from .models import User

__all__ = ["Repo"]
UserId = NewType("UserId", int)
Json: TypeAlias = dict[str, "Json"]
type Pair[T] = tuple[T, T]

class Repo(Protocol):
    def get(self, id: int) -> User: ...

class Base(ABC):
    @abstractmethod
    def run(self) -> None: ...

class Meta(metaclass=ABCMeta):
    pass

class Movie(TypedDict, total=False):
    title: str
    year: int

class UserView(LoginRequiredMixin, View):
    def get(self, request):
        return render(request, "x.html")

urlpatterns = [
    path("", views.index, name="index"),
    path("users/<int:pk>/", UserView.as_view(), name="user"),
    re_path(r"^archive/(?P<year>[0-9]{4})/$", views.archive),
    path("api/", include("api.urls")),
]

def create_app():
    app = Flask(__name__)
    @app.route("/health")
    def health():
        return "ok"
    app.add_url_rule("/items", view_func=items, methods=["POST"])
    return app

@get("/litestar")
async def lite() -> str: ...
routes = [Route("/", homepage), WebSocketRoute("/ws", ws)]
`;
test('Python: Protocol and ABC are interfaces, typed aliases are types, Django and Flask/Starlette routes are routes',()=>{
  const r=analyze('app/urls.py',URLS);
  assert.deepEqual(list(r),['variable __all__','type UserId','type Json','type Pair','interface Repo','method Repo.get','interface Base','method Base.run',
    'interface Meta','type Movie','property Movie.title','property Movie.year','class UserView','method UserView.get',
    'api.route ROUTE /','api.route ROUTE users/<int:pk>/','api.route ROUTE ^archive/(?P<year>[0-9]{4})/$','variable urlpatterns',
    'function create_app','api.route create_app.ROUTE /health','api.route create_app.POST /items','api.route GET /litestar',
    'api.route ROUTE /','api.route ROUTE /ws','variable routes']);
  assert.ok(!r.symbols.some(s=>/api\//.test(s.name)),'path("api/", include(...)) mounts other routes: not a route');
  assert.deepEqual(r.imports.map(i=>i.spec),['__future__','typing','abc','django.urls','.views','.models'],'TYPE_CHECKING imports are imports');
  // Outside urls.py a path() call is just a call.
  assert.deepEqual(list(analyze('app/util.py','x = path("a/b")\n')),['variable x']);
});
test('Python: inserting lines changes no key; editing a route call modifies exactly that route',()=>{
  invariants('app/urls.py',URLS,{prefix:'# header\n\n',edit:['re_path(r"^archive/(?P<year>[0-9]{4})/$", views.archive)','re_path(r"^archive/(?P<year>[0-9]{4})/$", views.archive_v2)'],
    modified:['symbol.modified ROUTE ^archive/(?P<year>[0-9]{4})/$','symbol.modified urlpatterns']});
});
test('Python: test_*.py, *_test.py and conftest.py are validation modules; other files are not',()=>{
  const p=project({'shop/test_orders.py':'def test_total():\n    pass\n','shop/orders_test.py':'def test_x():\n    pass\n','conftest.py':'import pytest\n',
    'shop/orders.py':'def total():\n    return 1\n','shop/testing_utils.py':'def helper():\n    pass\n','shop/contest.py':'x = 1\n'},{salt:'py-tests'});
  assert.deepEqual(['shop/test_orders.py','shop/orders_test.py','conftest.py','shop/orders.py','shop/testing_utils.py','shop/contest.py'].map(f=>p.node(f).test),[true,true,true,false,false,false]);
});
