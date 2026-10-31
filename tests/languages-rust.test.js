'use strict';
// Rust adapter (engine/languages/rust.js): items, impl ownership, routes, the lexer's hard cases (raw strings, nested
// comments, lifetimes vs char literals), stable keys, and mod/use resolution including a Cargo workspace crate.
const test=require('node:test'),assert=require('node:assert/strict');
const {list,invariants,project,analyze}=require('./languages-fixture');
const RS=String.raw`//! Crate docs: fn not_real() {}
#![allow(dead_code)]
use std::collections::HashMap;
use crate::db::{self, pool::Pool, Conn as C};
use super::config::Config;
use serde::{Deserialize, Serialize};

mod db;
#[path = "generated/proto.rs"]
mod proto;
pub mod api;

pub const LIMIT: usize = 10;
static mut COUNTER: u32 = 0;
pub static NAMES: [&str; 2] = ["a", "}"];
const DEFAULT: Config = Config { retries: 3, name: "x" };

/// An order. struct Fake {}
#[derive(Debug, Clone, Serialize)]
pub struct Order<'a, T: Clone> {
    pub id: u64,
    #[serde(rename = "items")]
    pub(crate) items: Vec<T>,
    lookup: HashMap<String, Vec<&'a str>>,
    r#type: String,
}
pub struct Point(i32, i32);
pub struct Unit;
pub enum State { Open, Closed { at: u64 }, Failed(String) }
pub union Bits { i: u32, f: f32 }
pub type Result<T> = std::result::Result<T, Error>;

pub trait Repo: Send + Sync {
    type Item;
    const MAX: usize;
    fn get(&self, id: u64) -> Option<Self::Item>;
    fn all(&self) -> Vec<Self::Item> { vec![] }
}

impl<'a, T: Clone> Order<'a, T> {
    pub const KIND: &'static str = "order";
    pub fn new(id: u64) -> Self {
        let c = '{'; let s = r#"fn ghost() { "#; let b = b'}'; let q = '\'';
        /* nested /* comment */ fn ghost2() {} */
        Order { id, items: vec![], lookup: HashMap::new(), r#type: String::new() }
    }
    fn label<'b>(&'b self) -> &'b str where T: Clone { 'outer: loop { break 'outer; } "x" }
}
impl<T: Clone> fmt::Display for Order<'_, T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { write!(f, "{}", self.id) }
}
unsafe impl Send for Unit {}

pub async fn handler() -> &'static str { "ok" }
#[get("/orders/{id}")]
async fn get_order(path: web::Path<u64>) -> impl Responder { "x" }
#[actix_web::route("/multi", method = "GET", method = "POST")]
async fn multi() -> &'static str { "y" }

macro_rules! square { ($x:expr) => { $x * $x }; }

extern "C" { fn abs(x: i32) -> i32; }

pub fn app() -> Router {
    Router::new()
        .route("/api/orders", get(list_orders).post(create_order))
        .route("/health", any(health))
        .route("/plain", handler_service)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn it_works() { assert_eq!(2 + 2, 4); }
}
`;
test('Rust: structs, enums, traits, impl methods owned by their type, consts, macros, extern blocks and routes',()=>{
  const r=analyze('crates/shop/src/orders.rs',RS);
  assert.deepEqual(list(r),['variable LIMIT','variable COUNTER','variable NAMES','variable DEFAULT',
    'class Order','property Order.id','property Order.items','property Order.lookup','property Order.type',
    'class Point','class Unit','class State','class Bits','property Bits.i','property Bits.f','type Result',
    'interface Repo','property Repo.MAX','method Repo.get','method Repo.all',
    'property Order.KIND','method Order.new','method Order.label','method Order.fmt',
    'function handler','api.route GET /orders/{id}','api.route ROUTE /multi','function square','function abs','function app','function it_works',
    'api.route app.GET /api/orders','api.route app.POST /api/orders','api.route app.ROUTE /health','api.route app.ROUTE /plain']);
  assert(!r.symbols.some(s=>/ghost|not_real|Fake/.test(s.name)),'raw strings, nested comments and char literals hide nothing');
  assert.equal(r.symbols.find(s=>s.name==='label').line,47,"'b and 'outer are lifetimes and labels, not char literals");
});
test('Rust: mod and use paths follow the 2018 module rules; `use super::*` in an inline test module is no import',()=>{
  const imports=Object.fromEntries(analyze('crates/shop/src/orders.rs',RS).imports.map(i=>[i.spec,i]));
  assert.deepEqual(Object.keys(imports),['std::collections::HashMap','crate::db','crate::db::pool::Pool','crate::db::Conn','super::config::Config',
    'serde::Deserialize','serde::Serialize','mod db','mod proto','mod api']);
  assert.equal(imports['mod db'].target,'crates/shop/src/orders/db');assert.equal(imports['mod db'].alt,'crates/shop/src/orders/db/mod');
  assert.equal(imports['mod proto'].target,'crates/shop/src/generated/proto.rs');
  assert.equal(imports['crate::db::pool::Pool'].target,'crates/shop/src/db/pool/Pool');
  assert.equal(imports['super::config::Config'].alt[1],'crates/shop/src/config');
  assert.equal(imports['std::collections::HashMap'].target,null);assert.equal(imports['serde::Serialize'].manifest,'rust');
  // A crate root declares its children beside itself.
  assert.equal(analyze('src/lib.rs','mod db;\n').imports[0].target,'src/db');
  assert.equal(analyze('src/bin/tool.rs','mod cli;\n').imports[0].target,'src/bin/cli');
});
test('Rust: inserting lines changes no key; editing a body modifies exactly that symbol',()=>{
  invariants('src/orders.rs',RS,{prefix:'// header\n\n',edit:['write!(f, "{}", self.id)','write!(f, "#{}", self.id)'],modified:['symbol.modified fmt']});
});
test('Rust: mod files, crate paths and a workspace crate named in Cargo.toml resolve to modules',()=>{
  const p=project({
    'Cargo.toml':'[workspace]\nmembers = ["crates/*"]\n',
    'crates/shop/Cargo.toml':'[package]\nname = "shop"\nversion = "0.1.0"\n',
    'crates/core/Cargo.toml':'[package]\nname = "shop-core" # the domain\n\n[dependencies]\nname = "not-this"\n',
    'crates/core/src/lib.rs':'pub mod model;\npub struct Money;\n',
    'crates/core/src/model.rs':'pub struct Order;\n',
    'crates/shop/src/db.rs':'pub mod pool;\npub struct Conn;\n',
    'crates/shop/src/db/pool.rs':'pub struct Pool;\n',
    'crates/shop/src/api/mod.rs':'pub fn routes() {}\n',
    'crates/shop/src/lib.rs':'mod db;\nmod api;\nuse crate::db::pool::Pool;\nuse shop_core::model::Order;\nuse shop_core::Money;\nuse serde::Serialize;\npub fn run() {}\n',
    'crates/shop/benches/bench.rs':'fn bench() {}\n','crates/shop/tests/it.rs':'fn it() {}\n'
  });
  assert.deepEqual(p.edges('crates/shop/src/lib.rs'),['crates/core/src/lib.rs','crates/core/src/model.rs','crates/shop/src/api/mod.rs','crates/shop/src/db.rs','crates/shop/src/db/pool.rs']);
  assert.deepEqual(p.edges('crates/shop/src/db.rs'),['crates/shop/src/db/pool.rs']);
  assert.equal(p.node('crates/shop/benches/bench.rs').test,true);assert.equal(p.node('crates/shop/tests/it.rs').test,true);
  assert.equal(p.node('crates/shop/src/db.rs').test,false);assert.equal(p.node('crates/shop/src/db.rs').lang,'rs');
});
