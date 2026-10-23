export interface Todo { id: number; title: string; done: boolean }

const todos: Todo[] = [];

export function listTodos(): Todo[] {
  return todos.slice();
}

export function addTodo(title: string): Todo {
  const todo = { id: todos.length + 1, title, done: false };
  todos.push(todo);
  return todo;
}
