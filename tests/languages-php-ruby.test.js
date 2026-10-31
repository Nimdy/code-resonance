'use strict';
// PHP and Ruby adapters (engine/languages/php.js, ruby.js): classes, members, Laravel/Slim/Symfony and Rails/Sinatra
// routes, PHP outside <?php ?> and heredocs, Ruby heredocs, %w[] literals, regex vs division and end-delimited blocks,
// stable keys, and imports through composer.json PSR-4 and require_relative.
const test=require('node:test'),assert=require('node:assert/strict');
const {list,invariants,project,analyze}=require('./languages-fixture');
const PHP=String.raw`<!doctype html><p>{ class Ghost { } }</p>
<?php
declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\{Mailer, Billing\Invoice as Inv};
use function App\Support\helper;
use Illuminate\Http\Request;
require_once __DIR__ . '/../bootstrap.php';
require 'config/app.php';

const VERSION = '1.0';

/** class DocGhost { } */
#[Route('/users')]
final class UserController extends Controller implements HasRoutes
{
    use HasFactory, Notifiable;

    public const LIMIT = 10, MAX = 20;
    private ?string $name = null;
    protected static array $cache = [], $other;
    public readonly int $id;

    public function __construct(private readonly Mailer $mailer, public int $count = 0) {}

    #[Route('/{id}', name: 'user_show', methods: ['GET'])]
    public function show(int $id): User { $s = "a {$x["}"]} }"; return User::find($id); }

    #[Route('/', methods: ['POST', 'PUT'])]
    public function save(Request $r): void {
        $html = <<<HTML
          <div>{ function fake() { }</div>
          HTML;
    }

    abstract protected function hook(): void;
    public static function &make(): static { return new static(); }
}

interface HasRoutes { public function routes(): array; }
trait Notifiable { public function notify(): void {} }
enum Status: string { case Open = 'open'; public function label(): string { return 'x'; } }

function helper(string $x): string { return $x; }
$fn = function () { return 1; };

Route::get('/dashboard', [DashboardController::class, 'index']);
Route::post('users/{id}', fn ($id) => $id);
Route::match(['get', 'post'], '/form', $handler);
$app->get('/slim/{name}', function ($req, $res) { return $res; });
$cache->get('key', 'default');
?>
<footer>{ }</footer>
`;
const RUBY=String.raw`# frozen_string_literal: true
# class Ghost; def ghost; end; end
require "json"
require_relative "../lib/money"
require "shop/tax"
autoload :Ledger, "shop/ledger"

=begin
class BlockGhost
  def ghost; end
end
=end

module Shop
  VERSION = "1.0"
  Point = Struct.new(:x, :y)

  class Order < ApplicationRecord
    attr_accessor :lines, :total
    attr_reader(:id)
    LIMIT = 10
    SQL = <<~SQL
      SELECT * FROM orders WHERE x = 'end'
      class Fake; end
    SQL

    def initialize(lines = [])
      @lines = lines
      @total = 0 if lines.empty?
      self.class.count += 1 unless frozen?
    end

    def add(line)
      while @lines.size > LIMIT do @lines.shift end
      @lines << line
      x = if line.ok? then 1 else 2 end
      words = %w[if while def class end]
      re = line.split /,/
      ratio = total / 2
      ok = line.name =~ /end$/
      c = ?e
      "#{line.name} end #{ {a: "}"}[:a] }"
    end

    def total? = @total.positive?

    def self.build(*args, &blk)
      new(*args).tap { |o| o.lines.each { |l| blk&.call(l) } }
    end

    class << self
      def count; @count ||= 0; end
      attr_writer :count
    end

    private def secret
      case @total
      when 0 then :none
      else :some
      end
    end

    def each
      @lines.each do |line|
        yield line
      end
    end
  end
end

def helper(x)
  begin
    x.call
  rescue StandardError => e
    nil
  end
end

get "/health" do
  "ok"
end
__END__
class DataGhost; end
`;
const ROUTES=String.raw`Rails.application.routes.draw do
  root "pages#home"
  get "photos/:id", to: "photos#show"
  post "/orders", to: "orders#create"
  resources :users
  namespace :admin do
    get "dashboard", to: "admin#index"
    scope "/v2" do
      delete "items/:id", to: "items#destroy"
    end
  end
  match "search", to: "search#index", via: [:get, :post]
end
`;
test('PHP: classes, traits, enums, interfaces, members, promoted properties and Laravel / Slim / Symfony routes',()=>{
  const r=analyze('app/Http/Controllers/UserController.php',PHP);
  assert.deepEqual(list(r),['variable VERSION','class UserController','property UserController.LIMIT','property UserController.MAX','property UserController.name',
    'property UserController.cache','property UserController.other','property UserController.id','method UserController.__construct',
    'property UserController.mailer','property UserController.count','api.route UserController.GET /users/{id}','api.route UserController.ROUTE /users/',
    'method UserController.hook','method UserController.make','interface HasRoutes','method HasRoutes.routes','class Notifiable','method Notifiable.notify',
    'class Status','method Status.label','function helper','api.route GET /dashboard','api.route POST /users/{id}','api.route ROUTE /form','api.route GET /slim/{name}']);
  assert(!r.symbols.some(s=>/Ghost|fake|DocGhost/.test(s.name)),'HTML outside <?php ?>, docblocks, heredocs and interpolated strings add nothing');
  assert.deepEqual(r.imports.map(i=>i.spec),['App\\Models\\User','App\\Services\\Mailer','App\\Services\\Billing\\Invoice','App\\Support\\helper','Illuminate\\Http\\Request','__DIR__ . /../bootstrap.php','config/app.php']);
});
test('Ruby: classes, modules as owners, singleton methods, attrs, constants, Struct classes and Rails / Sinatra routes',()=>{
  const r=analyze('app/models/shop/order.rb',RUBY);
  assert.deepEqual(list(r),['property Shop.VERSION','class Shop.Point','class Shop.Order','property Order.lines','property Order.total','property Order.id',
    'property Order.LIMIT','property Order.SQL','method Order.initialize','method Order.add','method Order.total?','method Order.build','method Order.count',
    'property Order.count','method Order.secret','method Order.each','function helper','api.route GET /health']);
  assert(!r.symbols.some(s=>/Ghost|Fake/.test(s.name)),'comments, =begin blocks, heredocs, %w[] and __END__ hide their text');
  assert.deepEqual(list(analyze('config/routes.rb',ROUTES)),['api.route GET /','api.route GET /photos/:id','api.route POST /orders',
    'api.route GET /admin/dashboard','api.route DELETE /admin/v2/items/:id','api.route ROUTE /search']);
});
test('PHP and Ruby: inserting lines changes no key; editing a body modifies exactly that symbol',()=>{
  invariants('app/Http/Controllers/UserController.php',PHP,{prefix:'<!-- header -->\n\n',edit:['public function notify(): void {}','public function notify(): void { $this->x(); }'],modified:['symbol.modified Notifiable','symbol.modified notify']});
  invariants('app/models/shop/order.rb',RUBY,{prefix:'# header\n\n',edit:['blk&.call(l)','blk&.call(l, 1)'],modified:['symbol.modified Order','symbol.modified build']});
  // Prefix inside PHP: the opening tag stays first.
  assert.deepEqual(analyze('a.php','<?php\n\nfunction f() { return 1; }\n').symbols.map(s=>s.key),analyze('a.php','<?php\n// x\n\n\nfunction f() { return 1; }\n').symbols.map(s=>s.key));
});
test('PHP and Ruby: composer.json PSR-4 and require_relative resolve; gems and vendor packages stay external',()=>{
  const p=project({
    'composer.json':JSON.stringify({autoload:{'psr-4':{'App\\':'app/'}},'autoload-dev':{'psr-4':{'Tests\\':'tests/'}}}),
    'app/Models/User.php':'<?php\nnamespace App\\Models;\nclass User {}\n','bootstrap.php':'<?php\n',
    'app/Http/Controllers/UserController.php':'<?php\nnamespace App\\Http\\Controllers;\nuse App\\Models\\User;\nuse Illuminate\\Http\\Request;\nrequire_once __DIR__ . \'/../../../bootstrap.php\';\nclass UserController {}\n',
    'tests/Feature/UserTest.php':'<?php\nuse App\\Models\\User;\nclass UserTest {}\n',
    'lib/money.rb':'class Money; end\n','lib/shop/tax.rb':'module Tax; end\n',
    'app/models/order.rb':'require_relative "../../lib/money"\nrequire "shop/tax"\nrequire "json"\nclass Order; end\n','spec/models/order_spec.rb':'describe Order do; end\n'
  },{salt:'php-rb'});
  assert.deepEqual(p.edges('app/Http/Controllers/UserController.php'),['app/Models/User.php','bootstrap.php']);
  assert.deepEqual(p.edges('tests/Feature/UserTest.php'),['app/Models/User.php']);
  assert.deepEqual(p.edges('app/models/order.rb'),['lib/money.rb','lib/shop/tax.rb']);
  assert.equal(p.node('tests/Feature/UserTest.php').test,true);assert.equal(p.node('spec/models/order_spec.rb').test,true);
  assert.deepEqual([p.node('app/Models/User.php').lang,p.node('app/models/order.rb').lang],['php','rb']);
});
