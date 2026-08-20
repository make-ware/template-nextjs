# Next.js Web Application

This is the Next.js frontend application for the Next.js + PocketBase monorepo template.

## Quick Start

### Development

From the **root** of the monorepo:

```bash
# Start both Next.js and PocketBase
yarn dev

# Or start Next.js only (if PocketBase is already running)
yarn workspace webapp dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Build

```bash
# Build from root (builds shared package first)
yarn build

# Or build webapp only
yarn workspace webapp build
```

### Production

```bash
yarn workspace webapp start
```

## Project Structure

The webapp follows a clean layered architecture with clear import flows:

```
webapp/src/
├── app/                    # Next.js App Router (pages & layouts)
├── components/
│   ├── auth/               # Authentication feature components
│   ├── todos/              # Todo feature components
│   ├── layout/             # Layout components (navigation, etc.)
│   └── ui/                 # shadcn/ui primitives
├── contexts/               # React contexts (consume services)
├── hooks/                  # Custom React hooks (use contexts)
├── lib/
│   ├── pocketbase.ts       # PocketBase client singleton
│   ├── types.ts            # Local TypedPocketBase interface
│   └── utils.ts            # General utilities
├── mutators/               # Data mutation layer (CRUD operations)
│   ├── base.ts             # BaseMutator abstract class
│   ├── todo.ts             # TodoMutator
│   ├── user.ts             # UserMutator
│   └── index.ts            # Barrel export
├── services/               # Business logic layer
│   ├── auth.ts             # AuthService (login, register, etc.)
│   └── index.ts            # Barrel export
└── test/                   # Test files
```

### Architecture & Import Flow

```
@template-ware/shared (Types & Schemas)
       ↓
lib/pocketbase.ts (PocketBase Client)
       ↓
mutators/ (Data Layer)
       ↓
services/ (Business Logic)
       ↓
contexts/ (State Management)
       ↓
hooks/ (Reusable Logic)
       ↓
components/ (UI)
       ↓
app/ (Pages)
```

## Using the Shared Package

The `@template-ware/shared` package exports:

- **Types & Schemas**: `User`, `Todo`, `TodoInput`, validation schemas, etc.
- **Utility Functions**: Error handling, data transformations
- **Enums**: Shared constants

**The shared package does NOT export mutators or services** - these are application-specific and live in the webapp.

### Importing Types

```typescript
// Import types and schemas from shared
import type { Todo, TodoInput, User } from '@template-ware/shared';
import { TodoInputSchema } from '@template-ware/shared';
```

## Data Layer: Mutators

**All PocketBase data operations use mutators.** Mutators provide type safety, validation, and consistent error handling.

### Using Mutators

```typescript
'use client';

import { TodoMutator } from '@/mutators';
import pb from '@/lib/pocketbase';
import type { TodoInput } from '@template-ware/shared';

export function MyComponent() {
  // Create mutator instance
  const todoMutator = new TodoMutator(pb);

  const fetchTodos = async () => {
    // Type-safe CRUD operations
    const result = await todoMutator.getList(1, 10);
    return result.items;
  };

  const createTodo = async (data: TodoInput) => {
    const newTodo = await todoMutator.create({
      title: data.title,
      description: data.description,
      completed: false,
    });
    return newTodo;
  };

  // ...
}
```

### Available Mutators

- **`BaseMutator`**: Abstract base class with CRUD operations
- **`TodoMutator`**: Todo-specific operations (create, update, delete, toggle, etc.)
- **`UserMutator`**: User-specific operations

All mutators are in `webapp/src/mutators/` and imported via `@/mutators`.

## Business Logic: Services

Services encapsulate complex business logic and compose mutators.

### Using the Auth Service

```typescript
'use client';

import { createAuthService } from '@/services';
import pb from '@/lib/pocketbase';

export function LoginForm() {
  const authService = createAuthService(pb);

  const handleLogin = async (email: string, password: string) => {
    try {
      const user = await authService.login(email, password);
      console.log('Logged in:', user);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  // ...
}
```

### Available Services

- **`AuthService`**: Authentication operations (login, register, logout, refresh, password change)

All services are in `webapp/src/services/` and imported via `@/services`.

## State Management: Contexts

Use React contexts for state management. Contexts consume services and provide data/actions to components.

### Using Contexts

```typescript
'use client';

import { useTodo } from '@/hooks/use-todo';

export function TodoList() {
  const { todos, isLoading, createTodo, updateTodo, deleteTodo } = useTodo();

  // Use todos and actions in your component
}
```

### Available Contexts

- **`AuthContext`**: Authentication state and actions
- **`TodoContext`**: Todo list state and CRUD operations

Access contexts via hooks: `useAuth()`, `useTodo()`

## Tech Stack

- **Framework:** Next.js 16+ with App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Components:** shadcn/ui (Radix UI primitives)
- **Forms:** React Hook Form + Zod validation
- **Icons:** Lucide React
- **Themes:** next-themes (dark mode support)
- **Backend:** PocketBase (client-side only)

## Connecting to PocketBase

### ⚠️ Client-Side Only (No SSR)

**This project does NOT use Server-Side Rendering (SSR) for PocketBase data.** All PocketBase operations are performed client-side only. This avoids security issues with shared SDK instances and simplifies the architecture.

See [PB_SSR.md](../../docs/PB_SSR.md) for detailed information about why SSR is not recommended.

### PocketBase Client Setup

The PocketBase client is configured in `lib/pocketbase.ts`:

```typescript
// webapp/src/lib/pocketbase.ts
import PocketBase from 'pocketbase';
import type { TypedPocketBase } from './types';
import { readRuntimeConfig } from './runtime-config';

export function resolveUrl(): string {
  return (
    // Server-injected runtime override (PUBLIC_POCKETBASE_URL)
    readRuntimeConfig()?.pocketbaseUrl ||
    // Inlined by `next build`
    process.env.NEXT_PUBLIC_POCKETBASE_URL ||
    'http://localhost:8090'
  );
}

const pb = createPocketBaseClient(resolveUrl(), { ... }) as TypedPocketBase;

export default pb;
```

Always use this singleton instance - never create new PocketBase instances.

**Never touch `pb` at module scope.** Use it inside a render, effect, or callback only.
The URL above is fixed when the module loads, but React hoists Next's async bundle chunks
above the root layout's inline runtime-config script, so a chunk can construct the
singleton before the injected URL exists. `AuthProvider` calls `syncBaseUrl()` during its
render — above every consumer — to reconcile `pb.baseURL`, and that is only sufficient
while no request has already gone out on the stale URL.

## Development Best Practices

### 1. Follow the Import Flow

```typescript
// ✅ CORRECT: Follow the architecture layers
import type { Todo } from '@template-ware/shared'; // Types from shared
import pb from '@/lib/pocketbase'; // Client from lib
import { TodoMutator } from '@/mutators'; // Mutator from mutators
import { createAuthService } from '@/services'; // Service from services
import { useTodo } from '@/hooks/use-todo'; // Hook from hooks

// ❌ WRONG: Skip layers or use direct SDK calls
import { pb } from '@template-ware/shared'; // Don't import from shared
const todo = await pb.collection('todos').create(); // Don't use SDK directly
```

### 2. Use Mutators for All Data Operations

```typescript
// ✅ CORRECT: Use mutators
const todoMutator = new TodoMutator(pb);
const todo = await todoMutator.create({ title: 'New Todo' });

// ❌ WRONG: Direct SDK calls
const todo = await pb.collection('todos').create({ title: 'New Todo' });
```

### 3. Client-Side Only

```typescript
// ✅ CORRECT: Client components for PocketBase
'use client';

import { useTodo } from '@/hooks/use-todo';

export function TodoList() {
  const { todos } = useTodo();
  return <div>{/* ... */}</div>;
}

// ❌ WRONG: Server components with PocketBase
// Don't use PocketBase in Server Components
export default async function TodoPage() {
  const todos = await pb.collection('todos').getList(); // NO!
}
```

### 4. Type Safety

```typescript
// ✅ CORRECT: Import and use types
import type { TodoInput, Todo } from '@template-ware/shared';
import { TodoInputSchema } from '@template-ware/shared';

const validateInput = (data: TodoInput): Todo => {
  const validated = TodoInputSchema.parse(data);
  // ...
};

// ❌ WRONG: Untyped data
const createTodo = (data: any) => {
  // No type checking
  // ...
};
```

### 5. Environment Variables

Create `.env.local` in the webapp directory:

```bash
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
```

Use the `NEXT_PUBLIC_` prefix for client-side environment variables that are fixed at
build time — Next inlines them into the browser bundle, so they cannot change afterwards.

For a client-side value an operator must be able to change **without a rebuild**, use the
unprefixed runtime channel instead: `PUBLIC_POCKETBASE_URL` is read from `process.env` by
the root layout per request and injected into the page. See
`src/lib/runtime-config.ts` for the contract, and the root
[README](../README.md#runtime-config-the-public_-pattern) for the pattern.

## Available Scripts

- `yarn workspace webapp dev` - Start development server
- `yarn workspace webapp build` - Build for production
- `yarn workspace webapp start` - Start production server
- `yarn workspace webapp lint` - Run ESLint
- `yarn workspace webapp lint:fix` - Fix ESLint issues
- `yarn workspace webapp typecheck` - Run TypeScript type checking
- `yarn workspace webapp test` - Run tests
- `yarn workspace webapp clean` - Remove `.next` directory

## Adding Components

This project uses [shadcn/ui](https://ui.shadcn.com). Add new components:

```bash
# From the webapp directory
npx shadcn@latest add [component-name]
```

Components are added to `components/ui/` and can be customized as needed.

## Creating New Features

When adding a new feature (e.g., "Posts"), follow this pattern:

### 1. Define Schema in Shared Package

```typescript
// shared/src/schema/post.ts
import { z } from 'zod';

export const PostInputSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
});

export type PostInput = z.infer<typeof PostInputSchema>;
export type Post = PostInput & {
  id: string;
  user: string;
  created: string;
  updated: string;
};
```

### 2. Create Mutator in Webapp

```typescript
// webapp/src/mutators/post.ts
import { RecordService } from 'pocketbase';
import {
  type Post,
  type PostInput,
  PostInputSchema,
} from '@template-ware/shared';
import type { TypedPocketBase } from '@/lib/types';
import { BaseMutator } from './base';

export class PostMutator extends BaseMutator<Post, PostInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): RecordService<Post> {
    return this.pb.collection('posts');
  }

  protected async validateInput(input: PostInput): Promise<PostInput> {
    return PostInputSchema.parse(input);
  }
}
```

### 3. Create Service (if needed)

```typescript
// webapp/src/services/post.ts
import type PocketBase from 'pocketbase';
import type { TypedPocketBase } from '@/lib/types';
import { PostMutator } from '@/mutators';

export class PostService {
  private postMutator: PostMutator;

  constructor(pb: PocketBase) {
    this.postMutator = new PostMutator(pb as TypedPocketBase);
  }

  // Add complex business logic here
}
```

### 4. Create Context

```typescript
// webapp/src/contexts/post-context.tsx
'use client';

import { createContext, useState } from 'react';
import { PostMutator } from '@/mutators';
import pb from '@/lib/pocketbase';

// ... context implementation
```

### 5. Create Hook

```typescript
// webapp/src/hooks/use-post.ts
import { useContext } from 'react';
import { PostContext } from '@/contexts/post-context';

export function usePost() {
  const context = useContext(PostContext);
  if (!context) {
    throw new Error('usePost must be used within PostProvider');
  }
  return context;
}
```

### 6. Create Components

```typescript
// webapp/src/components/posts/post-list.tsx
'use client';

import { usePost } from '@/hooks/use-post';

export function PostList() {
  const { posts, isLoading } = usePost();
  // ... component implementation
}
```

## Documentation

- [Main README](../../README.md) - Monorepo overview
- [Shared Package](../shared/README.md) - Types, schemas, and utilities
- [PocketBase Introduction](../../docs/PB_INTRO.md) - Getting started with PocketBase
- [PocketBase SSR Guide](../../docs/PB_SSR.md) - Using PocketBase with Next.js SSR
- [PocketBase Authentication](../../docs/PB_AUTH.md) - Auth patterns and examples

## Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Set the root directory to `webapp/`
3. Set environment variables:
   - `NEXT_PUBLIC_POCKETBASE_URL` - Your PocketBase instance URL (build-time; inlined into the bundle)
   - `PUBLIC_POCKETBASE_URL` - optional runtime override, changeable without a rebuild
4. Deploy

### Other Platforms

Build the app and deploy the `.next` output:

```bash
yarn workspace webapp build
# Deploy the webapp/.next directory
```

Make sure to set the correct `NEXT_PUBLIC_POCKETBASE_URL` environment variable for your production PocketBase instance — it is inlined at build time, so it has to be right _before_ you build. To retarget an already-built deployment, set `PUBLIC_POCKETBASE_URL` at runtime instead.

## Troubleshooting

### Type Errors with PocketBase

If you see type mismatches between PocketBase versions:

1. Check that `webapp/src/lib/types.ts` defines `TypedPocketBase` using the local PocketBase package
2. Always cast the client: `pb as TypedPocketBase` when passing to mutators
3. Keep PocketBase versions in sync between `shared` and `webapp`

### Import Errors

If imports fail:

1. Verify the import path follows the architecture layers
2. Check that `@/` path alias is configured in `tsconfig.json`
3. Rebuild shared package: `yarn workspace @template-ware/shared build`

### Authentication Issues

If authentication doesn't persist:

1. Check that `NEXT_PUBLIC_POCKETBASE_URL` was set correctly **at build time** (or that
   `PUBLIC_POCKETBASE_URL` is set at runtime) — check `globalThis.__APP_RUNTIME_CONFIG__`
   and the PocketBase requests in the browser's network tab to see which URL is in play
2. Verify PocketBase is running and accessible
3. Check browser console for CORS errors
4. Ensure cookies are enabled in the browser
