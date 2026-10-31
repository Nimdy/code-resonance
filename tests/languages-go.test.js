'use strict';
// Go adapter (engine/languages/go.js): structure, routes, the scanner's edge cases, stable keys, and package imports
// resolved through go.mod to a file of the package's directory.
const test=require('node:test'),assert=require('node:assert/strict');
const {list,invariants,project,analyze,diff}=require('./languages-fixture');
const GO=`// Package store keeps orders. func NotReal() {}
package store

import (
	"context"
	"fmt"
	str "strings"
	"github.com/acme/shop/internal/db"
)

import "net/http"

const Limit = 10
const (
	A = iota
	B
	C, D = 1, 2
)
var (
	ErrMissing = fmt.Errorf("missing")
	cache      = map[string]int{"a": 1, "}": 2}
	_          = 3
)
var handler = func(w http.ResponseWriter, r *http.Request) {
	fmt.Println("func fake() {")
}

type ID string
type Alias = map[string][]int
type (
	Point struct{ X, Y int }
	Shape interface {
		Area() float64
		fmt.Stringer
	}
)

/* type Ghost struct { } */
type Order[T any] struct {
	ID      ID     \`json:"id"\`
	Items   []T    \`json:"items,omitempty"\`
	A, B    int
	*db.Conn
	sync.Mutex
	Meta struct {
		Note string
	}
	next *Order[T]
}

type Repo interface {
	Get(ctx context.Context, id ID) (*Order[int], error)
	List(
		ctx context.Context,
	) ([]Order[int], error)
}

func (o *Order[T]) Total() int { return len(o.Items) }
func (o Order[T]) String() string {
	s := \`raw } string { func Bad() {}\`
	r := '}'
	return s + string(r)
}

func New[T any](items ...T) *Order[T] {
	return &Order[T]{Items: items}
}

func Routes(mux *http.ServeMux, r *gin.Engine) {
	mux.HandleFunc("GET /orders/{id}", get)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {})
	http.Handle("/static/", fs)
	r.GET("/api/orders", list)
	r.Handle("DELETE", "/api/orders/:id", del)
	router.HandleFunc("/items", items).Methods("POST")
	app.Get("/fiber", h)
	resp, _ := client.Get("/not-a-route")
	q.Get("id")
	http.Get("http://example.com")
}

func asm(x int) int
`;
test('Go: types, fields, interfaces, methods by receiver, grouped declarations and routes',()=>{
  const r=analyze('internal/store/store.go',GO);
  assert.deepEqual(list(r),['variable Limit','variable A','variable B','variable C','variable D','variable ErrMissing','variable cache','variable handler',
    'type ID','type Alias','class Point','property Point.X','property Point.Y','interface Shape','method Shape.Area',
    'class Order','property Order.ID','property Order.Items','property Order.A','property Order.B','property Order.Conn','property Order.Mutex','property Order.Meta','property Order.next',
    'interface Repo','method Repo.Get','method Repo.List','method Order.Total','method Order.String','function New','function Routes','function asm',
    'api.route Routes.GET /orders/{id}','api.route Routes.ROUTE /health','api.route Routes.ROUTE /static/','api.route Routes.GET /api/orders',
    'api.route Routes.DELETE /api/orders/:id','api.route Routes.POST /items','api.route Routes.GET /fiber']);
  assert(!r.symbols.some(s=>/NotReal|Bad|fake|Ghost/.test(s.name)),'nothing from comments, strings or raw strings');
  assert.deepEqual(r.imports.map(i=>i.spec),['context','fmt','strings','github.com/acme/shop/internal/db','net/http']);
  assert(r.imports.every(i=>i.target===null&&i.manifest==='go'));
  assert.equal(r.symbols.find(s=>s.name==='Total').line,58);
});
test('Go: inserting lines changes no key; editing a body modifies exactly that symbol',()=>{
  invariants('internal/store/store.go',GO,{prefix:'// header\n\n',edit:['return len(o.Items)','return 0'],modified:['symbol.modified Total']});
  const added=diff(analyze('a.go',GO),analyze('a.go',GO.replace('import "net/http"','import "net/http"\nimport "os"')));
  assert.deepEqual(added.map(c=>`${c.kind} ${c.import.spec}`),['dependency.added os']);
});
test('Go: an import under the go.mod module resolves to its package directory, preferring the file named after it',()=>{
  const p=project({
    'go.mod':'module github.com/acme/shop\n\ngo 1.22\n',
    'internal/store/a.go':'package store\nfunc A() {}\n',
    'internal/store/store.go':'package store\ntype Store struct{}\n',
    'internal/store/store_test.go':'package store\nfunc TestStore(t *testing.T) {}\n',
    'internal/db/conn.go':'package db\ntype Conn struct{}\n',
    'internal/db/aa_test.go':'package db\nfunc TestConn(t *testing.T) {}\n',
    'cmd/api/main.go':'package main\nimport (\n\t"fmt"\n\t"github.com/acme/shop/internal/store"\n\t"github.com/acme/shop/internal/db"\n\t"github.com/other/lib"\n)\nfunc main() {}\n'
  });
  assert.deepEqual(p.edges('cmd/api/main.go'),['internal/db/conn.go','internal/store/store.go'],'a _test.go file never stands for a package; fmt and other modules stay external');
  assert.equal(p.node('internal/store/store_test.go').test,true);assert.equal(p.node('internal/store/store.go').test,false);
  assert.equal(p.node('cmd/api/main.go').lang,'go');
});
test('Go: nested modules resolve under the longest module path; without go.mod nothing is guessed',()=>{
  const p=project({
    'go.mod':'module example.com/mono\n','tools/go.mod':'module example.com/mono/tools\n',
    'tools/gen/gen.go':'package gen\nfunc Gen() {}\n','gen/gen.go':'package gen\nfunc Other() {}\n',
    'main.go':'package main\nimport "example.com/mono/tools/gen"\nfunc main() {}\n'
  },{salt:'nested'});
  assert.deepEqual(p.edges('main.go'),['tools/gen/gen.go']);
  const q=project({'lib/lib.go':'package lib\n','main.go':'package main\nimport "example.com/x/lib"\n'},{salt:'nomod'});
  assert.deepEqual(q.edges('main.go'),[]);
});
