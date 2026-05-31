import { useState, useEffect } from 'react'
import { Shield, Eye, Smartphone, Mail, Key, Globe, Save } from 'lucide-react'
import { useStore, Settings as SettingsType } from '../store'

interface ToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  label: string
  icon: React.ReactNode
}

function Toggle({ enabled, onChange, label, icon }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-dark-400 rounded-lg flex items-center justify-center text-dark-200">
          {icon}
        </div>
        <span className="text-white">{label}</span>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`w-12 h-6 rounded-full relative transition-all ${
          enabled ? 'bg-primary' : 'bg-dark-400'
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
            enabled ? 'right-1' : 'left-1'
          }`}
        />
      </button>
    </div>
  )
}

export default function SettingsPanel() {
  const { settings, updateSettings, monitorStatus } = useStore()
  const [localSettings, setLocalSettings] = useState<SettingsType>({})
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings)
    }
  }, [settings])

  useEffect(() => {
    if (settings) {
      const changed = Object.keys(localSettings).some(
        key => localSettings[key] !== settings[key]
      )
      setHasChanges(changed)
    }
  }, [localSettings, settings])

  const handleToggle = (key: string, value: boolean) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value.toString()
    }))
  }

  const handleInputChange = (key: string, value: string) => {
    setLocalSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSave = async () => {
    await updateSettings(localSettings)
    setHasChanges(false)
  }

  if (!settings) {
    return (
      <div className="bg-dark-500 rounded-xl border border-dark-400 p-10 text-center">
        <p className="text-dark-300">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-dark-500 rounded-xl border border-dark-400">
        <div className="p-5 border-b border-dark-400">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            监听设置
          </h3>
        </div>
        <div className="p-5 divide-y divide-dark-400">
          <Toggle
            enabled={monitorStatus}
            onChange={(value) => handleToggle('monitorEnabled', value)}
            label="启用剪贴板监听"
            icon={<Eye className="w-4 h-4" />}
          />
        </div>
      </div>

      <div className="bg-dark-500 rounded-xl border border-dark-400">
        <div className="p-5 border-b border-dark-400">
          <h3 className="text-lg font-semibold text-white">检测规则</h3>
        </div>
        <div className="p-5 divide-y divide-dark-400">
          <Toggle
            enabled={localSettings.detectIdCard === 'true'}
            onChange={(value) => handleToggle('detectIdCard', value)}
            label="检测身份证号"
            icon={<Shield className="w-4 h-4" />}
          />
          <Toggle
            enabled={localSettings.detectPhone === 'true'}
            onChange={(value) => handleToggle('detectPhone', value)}
            label="检测手机号"
            icon={<Smartphone className="w-4 h-4" />}
          />
          <Toggle
            enabled={localSettings.detectEmail === 'true'}
            onChange={(value) => handleToggle('detectEmail', value)}
            label="检测邮箱地址"
            icon={<Mail className="w-4 h-4" />}
          />
          <Toggle
            enabled={localSettings.detectIP === 'true'}
            onChange={(value) => handleToggle('detectIP', value)}
            label="检测 IP 地址"
            icon={<Globe className="w-4 h-4" />}
          />
          <Toggle
            enabled={localSettings.detectApiKey === 'true'}
            onChange={(value) => handleToggle('detectApiKey', value)}
            label="检测 API 密钥"
            icon={<Key className="w-4 h-4" />}
          />
        </div>
      </div>

      <div className="bg-dark-500 rounded-xl border border-dark-400">
        <div className="p-5 border-b border-dark-400">
          <h3 className="text-lg font-semibold text-white">脱敏规则</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm text-dark-300 block mb-2">保留前几位</label>
            <input
              type="number"
              min="0"
              max="10"
              value={localSettings.maskKeepStart || '3'}
              onChange={(e) => handleInputChange('maskKeepStart', e.target.value)}
              className="w-full px-4 py-3 bg-dark-400 rounded-lg text-white border border-dark-300 focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-dark-300 block mb-2">保留后几位</label>
            <input
              type="number"
              min="0"
              max="10"
              value={localSettings.maskKeepEnd || '4'}
              onChange={(e) => handleInputChange('maskKeepEnd', e.target.value)}
              className="w-full px-4 py-3 bg-dark-400 rounded-lg text-white border border-dark-300 focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="text-sm text-dark-300 block mb-2">脱敏字符</label>
            <input
              type="text"
              maxLength={1}
              value={localSettings.maskChar || '*'}
              onChange={(e) => handleInputChange('maskChar', e.target.value)}
              className="w-full px-4 py-3 bg-dark-400 rounded-lg text-white border border-dark-300 focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </div>

      {hasChanges && (
        <button
          onClick={handleSave}
          className="w-full py-4 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all font-medium flex items-center justify-center gap-2"
        >
          <Save className="w-5 h-5" />
          保存设置
        </button>
      )}
    </div>
  )
}
