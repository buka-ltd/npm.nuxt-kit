# @buka/nuxt-kit

Buka Nuxt/Vue 开发套件，提供 composables、工具函数和 Keq HTTP 中间件。

## 安装

```bash
pnpm add @buka/nuxt-kit
```

本包为 ESM only，依赖 `vue`（>=3.3.0），`keq` 为可选 peer dependency。

## 模块

### 主入口 `@buka/nuxt-kit`

re-export 所有子模块。

```typescript
import {
  disposable,
  useAsyncFn,
  useCursorPagination,
  useOffsetPagination,
  useOffsetPage,
  Pkce,
  BukaRequestException,
  bukaErrorMiddleware,
  createBukaErrorMiddleware,
} from "@buka/nuxt-kit";
```

### Composables `@buka/nuxt-kit/composables`

| 导出                                    | 说明                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| `disposable(fn)`                        | 将函数包装为只执行一次，缓存并复用返回值（支持同步/异步）          |
| `useAsyncFn(fn)`                        | 追踪异步函数的 `pending` 和 `error` 状态                           |
| `useCursorPagination(defaultPageSize?)` | 游标分页数据层，维护 `startCursor`/`endCursor`/`hasNextPage` 等    |
| `useOffsetPagination(defaultPageSize?)` | 偏移分页数据层，维护 `limit`/`offset`/`total`                      |
| `useOffsetPage(state)`                  | 将 limit/offset/total 转换为 `page`/`pageSize`/`totalPages` 展示用 |

```typescript
import {
  useAsyncFn,
  useCursorPagination,
  useOffsetPagination,
  useOffsetPage,
} from "@buka/nuxt-kit/composables";

// 异步函数追踪
const { pending, error, execute } = useAsyncFn(fetchUsers);
const result = await execute();

// 偏移分页
const pagination = useOffsetPagination(20);
const { offset, limit } = pagination.nextPageParams;

// 游标分页
const cursorPagination = useCursorPagination();
const { startCursor, endCursor, hasNextPage } = cursorPagination;
```

### 工具函数 `@buka/nuxt-kit/utils`

| 导出              | 说明                                                         |
| ----------------- | ------------------------------------------------------------ |
| `Pkce.generate()` | 生成 PKCE `[codeVerifier, codeChallenge]` 对（SHA-256 S256） |

```typescript
import { Pkce } from "@buka/nuxt-kit/utils";

const [codeVerifier, codeChallenge] = await Pkce.generate();
```

### Keq 中间件 `@buka/nuxt-kit/keq`

提供 Keq HTTP 客户端的错误处理中间件和异常类，遵循 [Buka 结构化错误码规范](https://github.com/buka-ltd/docs.specifications/blob/main/coding/error-codes.md)。

#### BukaRequestException

继承自 `keq` 的 `RequestException`，将后端返回的标准错误响应提升为类型可判别的异常：

```typescript
class BukaRequestException extends RequestException {
  code: string; // 错误码，如 "B0-0001-1012-00B"
  errorCode: ErrorCode; // @buka/error-codes 解析后的结构化对象
  details: ExceptionDetail[]; // 错误详情
}
```

#### bukaErrorMiddleware

默认错误处理中间件。对 HTTP >= 400 的 JSON 响应自动解析 `{ error: { code, message, details } }` 并抛出 `BukaRequestException`；非 JSON 响应降级为 `createExceptionByStatusCode` 的兜底异常。401/403/404 自动标记为 `fatal`。

```typescript
import { bukaErrorMiddleware } from "@buka/nuxt-kit/keq";

request.use(bukaErrorMiddleware);
```

#### createBukaErrorMiddleware(options?)

可配置的工厂函数，支持**错误码 → 异常子类**分发。适用于需要按特定错误码抛出不同异常实例的业务场景：

```typescript
import {
  createBukaErrorMiddleware,
  BukaRequestException,
} from "@buka/nuxt-kit/keq";

// 定义业务异常子类（空类体自动继承父类构造器）
class SessionExpiredException extends BukaRequestException {}
class PrincipalNotFoundException extends BukaRequestException {}

// 注册错误码分发
request.use(
  createBukaErrorMiddleware({
    errorDispatchers: {
      "B0-0001-1012-00B": SessionExpiredException,
      "V0-0001-1005-00M": PrincipalNotFoundException,
    },
  }),
);

// 业务层通过 instanceof 区分处理
try {
  await someApiCall();
} catch (err) {
  if (err instanceof SessionExpiredException) {
    // 跳转登录页
  } else if (err instanceof PrincipalNotFoundException) {
    // 回退到注册流程
  }
}
```

**处理流程**：

1. 无 response 或 status < 400 → 透传
2. 非 JSON 响应 → `createExceptionByStatusCode()` 兜底
3. JSON body 含 `error` → 查 `errorDispatchers`：命中则实例化注册的子类，未命中抛 `BukaRequestException`
4. JSON body 不含 `error` → `createExceptionByStatusCode()` 兜底

#### 类型

| 类型                          | 说明                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `BukaRequestExceptionOptions` | 构造选项，含 `code`、`details`、`fatal`、`response`       |
| `BukaExceptionConstructor`    | 异常子类构造器接口，约束 `errorDispatchers` 的 value 类型 |
| `BukaErrorMiddlewareOptions`  | `createBukaErrorMiddleware` 配置项                        |

#### Nuxt 配置

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  vite: {
    optimizeDeps: {
      include: ["@buka/nuxt-kit/keq"],
    },
  },
});
```

## 许可

MIT
