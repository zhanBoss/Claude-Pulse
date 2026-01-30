import { Modal, Switch, Space, Typography } from 'antd'
import { useState, useEffect } from 'react'

const { Text } = Typography

interface SettingsModalProps {
  visible: boolean
  onClose: () => void
  darkMode: boolean
}

function SettingsModal({ visible, onClose, darkMode: propDarkMode }: SettingsModalProps) {
  const [darkMode, setDarkMode] = useState(false)
  const [autoStart, setAutoStart] = useState(false)

  useEffect(() => {
    if (visible) {
      window.electronAPI.getAppSettings().then(settings => {
        setDarkMode(settings.darkMode)
        setAutoStart(settings.autoStart)
      })
    }
  }, [visible])

  // 同步外部的 darkMode 状态
  useEffect(() => {
    if (visible) {
      setDarkMode(propDarkMode)
    }
  }, [visible, propDarkMode])

  const handleSave = async () => {
    await window.electronAPI.saveAppSettings({ darkMode, autoStart })
    onClose()
  }

  return (
    <Modal
      title="设置"
      open={visible}
      onOk={handleSave}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>深色模式</Text>
          <Switch checked={darkMode} onChange={setDarkMode} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>开机自启动</Text>
          <Switch checked={autoStart} onChange={setAutoStart} />
        </div>
      </Space>
    </Modal>
  )
}

export default SettingsModal
