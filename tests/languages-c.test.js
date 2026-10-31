'use strict';
// C and C++ adapter (engine/languages/cfamily.js): classes, members, out-of-line definitions, prototypes, typedefs,
// templates, macros and conditional compilation, raw strings and digit separators, stable keys, and #include resolution.
const test=require('node:test'),assert=require('node:assert/strict');
const {list,invariants,project,analyze}=require('./languages-fixture');
const CPP=String.raw`// store.cpp: void ghost() {}
#include "store.h"
#include "../common/log.h"
#include <vector>
#include <acme/net.h>
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define BLOCK { if (x) {
#if 0
int disabled() {
#else
int enabled(int a) {
#endif
  return a;
}

namespace acme { namespace store {

static int counter = 0;
const char *names[] = {"{", "}"};
std::vector<int> ids{1, 2, 3};
auto square = [](int x) { return x * x; };
int (*callback)(int) = nullptr;
extern "C" int c_api(void);
extern "C" { void c_init(void); }
typedef struct { int x, y; } point_t;
typedef struct node { struct node *next; } node_t;
typedef void (*handler_t)(int code);
using Map = std::map<std::string, int>;
enum class Color : uint8_t { Red, Green };
struct Rect;

template <typename T>
class LIBACME_API Store final : public Base<T>, private Mixin {
  Q_OBJECT
public:
  explicit Store(int capacity);
  ~Store() override;
  Store(const Store&) = delete;
  [[nodiscard]] int size() const noexcept { return size_; }
  virtual void flush() = 0;
  bool operator==(const Store& other) const;
  T& operator[](std::size_t i) { return items_[i]; }
  void operator()(int x) {}
  operator bool() const { return size_ > 0; }
  static constexpr int kMax = 64;
private:
  std::vector<T> items_{};
  int size_ = 0, cap_;
  unsigned flag : 1;
  struct Entry { int key; char value; };
};

Store<int>::Store(int capacity) : size_(0), items_{capacity}, cap_(capacity) {
  char c = '{';
  auto s = R"x(raw { string })x";
  long big = 1'000'000;
}
Store<int>::~Store() {}
bool Store<int>::operator==(const Store& other) const { return true; }
int free_function(int a, char *b) { return a; }
int prototype_only(int);
int defined_later(void);
int defined_later(void) { return 1; }
MODULE_INIT(store);
static inline void *xmalloc(size_t n) __attribute__((malloc));

}}  // namespace acme::store

int main(int argc, char **argv) {
  crow::SimpleApp app;
  CROW_ROUTE(app, "/health")([]() { return "ok"; });
  return 0;
}
`;
test('C/C++: classes, members, out-of-line definitions, typedefs, templates, globals, prototypes and Crow routes',()=>{
  const r=analyze('src/store/store.cpp',CPP);
  assert.deepEqual(list(r),['function enabled','variable counter','variable names','variable ids','variable square','variable callback',
    'class point_t','property point_t.x','property point_t.y','class node','property node.next','type handler_t','type Map','class Color',
    'class Store','method Store.size','method Store.operator[]','method Store.operator()','method Store.operator bool','property Store.kMax',
    'property Store.items_','property Store.size_','property Store.cap_','property Store.flag','class Store.Entry','property Entry.key','property Entry.value',
    'method Store.Store','method Store.~Store','method Store.operator==','function free_function','function defined_later','function main',
    'function c_api','function c_init','method Store.flush','function prototype_only','function xmalloc','api.route main.ROUTE /health']);
  assert(!r.symbols.some(s=>/ghost|disabled|MAX|MODULE_INIT/.test(s.name)),'comments, #if 0, macros and macro invocations add nothing');
  assert.equal(r.symbols.filter(s=>s.name==='defined_later').length,1,'a prototype of a function this file defines is not a second symbol');
});
test('C/C++: conditional branches are all read when balanced, the first one when they would unbalance braces',()=>{
  const r=analyze('a.c','#ifdef _WIN32\nint open_win(void);\n#else\nint open_posix(void);\n#endif\n#ifdef X\nint f(void) {\n#else\nint f(int a) {\n#endif\n  return 0;\n}\nint g(void) { return 1; }\n');
  assert.deepEqual(list(r),['function f','function g','function open_win','function open_posix']);
});
test('C/C++: inserting lines changes no key; editing a body modifies exactly that symbol',()=>{
  invariants('src/store/store.cpp',CPP,{prefix:'// header\n\n',edit:['int free_function(int a, char *b) { return a; }','int free_function(int a, char *b) { return a + 1; }'],modified:['symbol.modified free_function']});
});
test('C/C++: quoted includes resolve beside the file, then up its folders and their include/; angle includes only if the header exists',()=>{
  const p=project({
    'src/store/store.h':'#pragma once\nclass Store {};\n','src/common/log.h':'void log(const char *m);\n','include/acme/net.h':'int net_open(void);\n',
    'src/store/store.cpp':'#include "store.h"\n#include "../common/log.h"\n#include "util.h"\n#include <acme/net.h>\n#include <vector>\nint main() { return 0; }\n',
    'include/util.h':'int util(void);\n','src/store/store_test.cc':'#include "store.h"\nvoid TestStore() {}\n'
  },{salt:'c'});
  assert.deepEqual(p.edges('src/store/store.cpp'),['include/acme/net.h','include/util.h','src/common/log.h','src/store/store.h']);
  assert.equal(p.node('src/store/store_test.cc').test,true);assert.equal(p.node('src/store/store.h').lang,'c');assert.equal(p.node('src/store/store.cpp').lang,'cpp');
});
