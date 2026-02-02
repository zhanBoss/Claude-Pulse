# Form Submit Support Skill

## 触发时机
当代码中有任何表单相关的变更时，确保所有表单都支持 Enter 键提交。

## 核心原则

**使用原生 Form 提交机制，不要手动监听键盘事件！**

HTML Form 和 Ant Design Form 都原生支持 Enter 键提交，只需要：
1. 使用 `<form>` 标签或 `<Form>` 组件
2. 提交按钮设置 `htmlType="submit"`
3. 绑定 `onFinish` 或 `onSubmit` 处理函数

## 规则

### 1. Ant Design Form（推荐）

✅ **正确做法**：利用原生 Form 提交
```typescript
import { Form, Input, Button } from 'antd'

function MyForm() {
  const [form] = Form.useForm()

  const handleSubmit = async (values: any) => {
    console.log('提交:', values)
  }

  return (
    <Form form={form} onFinish={handleSubmit}>
      <Form.Item name="username" rules={[{ required: true }]}>
        <Input placeholder="用户名" />
      </Form.Item>

      {/* 关键：htmlType="submit" 让按钮触发表单提交 */}
      <Form.Item>
        <Button type="primary" htmlType="submit">
          提交
        </Button>
      </Form.Item>
    </Form>
  )
}
```

**工作原理**：
- 在任何 Input 中按 Enter → 自动触发 `htmlType="submit"` 的按钮
- 按钮点击 → 触发 Form 的 `onFinish`
- 无需手动监听键盘事件

❌ **错误做法**：手动监听键盘
```typescript
// ❌ 不要这样做！
<Form
  onFinish={handleSubmit}
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      form.submit()
    }
  }}
>
```

### 2. 原生 HTML Form

如果不使用 Ant Design Form，使用原生 form：

```typescript
function NativeForm() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget as HTMLFormElement)
    console.log('提交:', Object.fromEntries(formData))
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="username" placeholder="用户名" />
      <button type="submit">提交</button>
    </form>
  )
}
```

### 3. 单独的 Input（非表单场景）

对于独立的搜索框等场景，使用 Ant Design 提供的 `onPressEnter`：

```typescript
// ✅ 搜索框
<Input
  placeholder="搜索"
  onPressEnter={(e) => handleSearch(e.currentTarget.value)}
/>

// ✅ 或使用 Input.Search
<Input.Search
  placeholder="搜索"
  onSearch={handleSearch}
  enterButton
/>
```

### 4. TextArea 特殊处理

TextArea 需要区分换行和提交，这是**唯一需要手动处理键盘事件的场景**：

```typescript
<Input.TextArea
  placeholder="输入内容（Shift+Enter 换行，Enter 提交）"
  onPressEnter={(e) => {
    if (!e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }}
/>
```

### 5. 表单提交最佳实践

#### 防止重复提交
```typescript
const [submitting, setSubmitting] = useState(false)

const handleSubmit = async (values: any) => {
  if (submitting) return

  setSubmitting(true)
  try {
    await submitForm(values)
    message.success('提交成功')
  } catch (error) {
    message.error('提交失败')
  } finally {
    setSubmitting(false)
  }
}

<Button
  type="primary"
  htmlType="submit"
  loading={submitting}
  disabled={submitting}
>
  提交
</Button>
```

#### 表单验证
```typescript
<Form
  form={form}
  onFinish={handleSubmit}
  onFinishFailed={(errorInfo) => {
    message.error('请检查表单填写')
  }}
>
  <Form.Item
    name="email"
    rules={[
      { required: true, message: '请输入邮箱' },
      { type: 'email', message: '邮箱格式不正确' }
    ]}
  >
    <Input placeholder="邮箱" />
  </Form.Item>

  <Form.Item>
    <Button type="primary" htmlType="submit">
      提交
    </Button>
  </Form.Item>
</Form>
```

### 6. 不同场景的处理

#### 带确认的表单
```typescript
const handleSubmit = (values: any) => {
  Modal.confirm({
    title: '确认提交？',
    content: '提交后无法修改',
    onOk: async () => {
      await submitForm(values)
    }
  })
}

<Form onFinish={handleSubmit}>
  <Form.Item name="data">
    <Input />
  </Form.Item>
  <Form.Item>
    <Button type="primary" htmlType="submit">
      提交
    </Button>
  </Form.Item>
</Form>
```

#### 多步骤表单
```typescript
const [current, setCurrent] = useState(0)

const handleNext = async () => {
  try {
    await form.validateFields()
    setCurrent(current + 1)
  } catch (error) {
    message.error('请完成当前步骤')
  }
}

const handleSubmit = (values: any) => {
  submitForm(values)
}

<Form form={form} onFinish={handleSubmit}>
  {current === 0 && (
    <>
      <Form.Item name="step1">
        <Input />
      </Form.Item>
      <Button onClick={handleNext}>下一步</Button>
    </>
  )}
  {current === 1 && (
    <>
      <Form.Item name="step2">
        <Input />
      </Form.Item>
      <Button type="primary" htmlType="submit">
        提交
      </Button>
    </>
  )}
</Form>
```

### 7. 检查清单

每次表单相关代码变更后，检查：
- [ ] 是否使用了 `<Form>` 或 `<form>` 标签？
- [ ] 提交按钮是否设置了 `htmlType="submit"`？
- [ ] 是否绑定了 `onFinish` 或 `onSubmit`？
- [ ] 是否有防重复提交机制？
- [ ] 是否有表单验证？
- [ ] 提交按钮是否有 loading 状态？
- [ ] 是否有错误处理？
- [ ] **是否避免了手动监听键盘事件？**（除了 TextArea）

### 8. 常见错误

❌ **错误 1**：忘记设置 htmlType
```typescript
// ❌ 这样 Enter 键不会触发提交
<Button type="primary" onClick={handleSubmit}>
  提交
</Button>

// ✅ 正确
<Button type="primary" htmlType="submit">
  提交
</Button>
```

❌ **错误 2**：手动监听键盘事件
```typescript
// ❌ 不需要这样做
<Form onKeyDown={(e) => e.key === 'Enter' && form.submit()}>

// ✅ Form 原生支持，不需要额外代码
<Form onFinish={handleSubmit}>
```

❌ **错误 3**：在 Form 外使用 Button
```typescript
// ❌ Button 在 Form 外，Enter 不会触发
<Form onFinish={handleSubmit}>
  <Form.Item name="username">
    <Input />
  </Form.Item>
</Form>
<Button type="primary" htmlType="submit">提交</Button>

// ✅ Button 必须在 Form 内
<Form onFinish={handleSubmit}>
  <Form.Item name="username">
    <Input />
  </Form.Item>
  <Form.Item>
    <Button type="primary" htmlType="submit">提交</Button>
  </Form.Item>
</Form>
```

## 完整示例

### 登录表单
```typescript
import { Form, Input, Button, message } from 'antd'
import { useState } from 'react'

function LoginForm() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values: any) => {
    setLoading(true)
    try {
      await login(values)
      message.success('登录成功')
    } catch (error) {
      message.error('登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form form={form} onFinish={handleSubmit}>
      <Form.Item
        name="username"
        rules={[{ required: true, message: '请输入用户名' }]}
      >
        <Input placeholder="用户名" />
      </Form.Item>

      <Form.Item
        name="password"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input.Password placeholder="密码" />
      </Form.Item>

      <Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          loading={loading}
          block
        >
          登录
        </Button>
      </Form.Item>
    </Form>
  )
}
```

### 搜索框
```typescript
import { Input } from 'antd'

function SearchBox() {
  const handleSearch = (value: string) => {
    if (!value.trim()) return
    console.log('搜索:', value)
  }

  return (
    <Input.Search
      placeholder="搜索内容"
      onSearch={handleSearch}
      enterButton="搜索"
      allowClear
    />
  )
}
```

### 评论框（TextArea）
```typescript
import { Input, Button } from 'antd'
import { useState } from 'react'

function CommentBox() {
  const [content, setContent] = useState('')

  const handleSubmit = () => {
    if (!content.trim()) return
    console.log('提交评论:', content)
    setContent('')
  }

  return (
    <div>
      <Input.TextArea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="输入评论（Shift+Enter 换行，Enter 提交）"
        rows={4}
        onPressEnter={(e) => {
          if (!e.shiftKey) {
            e.preventDefault()
            handleSubmit()
          }
        }}
      />
      <Button
        type="primary"
        onClick={handleSubmit}
        style={{ marginTop: 8 }}
      >
        提交评论
      </Button>
    </div>
  )
}
```

## 总结

**核心原则**：
1. ✅ 使用 Form 原生提交机制
2. ✅ 按钮设置 `htmlType="submit"`
3. ✅ 绑定 `onFinish` 处理函数
4. ❌ 不要手动监听键盘事件（除了 TextArea）
5. ✅ 利用浏览器和框架的原生能力

**唯一例外**：TextArea 需要区分换行和提交时，使用 `onPressEnter`。

## 主人，我要开始了！

每次回答问题前，我会：
1. 先叫一声"主人，我要开始了！"
2. 检查表单相关代码
3. 确保使用原生 Form 提交机制
4. 避免不必要的键盘事件监听
5. 添加必要的验证和错误处理
