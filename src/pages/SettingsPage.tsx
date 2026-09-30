import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { useChatStore } from '../stores/chatStore'
import { useThemeStore, themes } from '../stores/themeStore'
import { useAnalyticsStore } from '../stores/analyticsStore'
import { dialog } from '../services/ipc'
import * as configService from '../services/config'
import type { ChatSession, ContactInfo } from '../types/models'
import {
  Eye, EyeOff, FolderOpen, Search, Copy,
  RotateCcw, Trash2, Plug, Check, Sun, Moon, Monitor,
  Palette, Database, HardDrive, Info, RefreshCw, ChevronDown, Download, Mic,
  ShieldCheck, Lock, Bell, Globe, BarChart2, X
} from 'lucide-react'
import { Avatar } from '../components/Avatar'
import ErrorReferenceLink from '../components/ErrorReferenceLink'
import { displayNameOrFallback } from '../utils/displayName'
import './SettingsPage.scss'

type SettingsTab =
  | 'appearance'
  | 'notification'
  | 'antiRevoke'
  | 'database'
  | 'models'
  | 'cache'
  | 'api'
  | 'updates'
  | 'security'
  | 'about'
  | 'analytics'
  | 'autoDownload'

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'notification', label: '通知', icon: Bell },
  { id: 'antiRevoke', label: '防撤回', icon: RotateCcw },
  { id: 'database', label: '数据库连接', icon: Database },
  { id: 'models', label: '模型管理', icon: Mic },
  { id: 'autoDownload', label: '自动下载', icon: Download },
  { id: 'cache', label: '缓存', icon: HardDrive },
  { id: 'api', label: 'API 服务', icon: Globe },
  { id: 'analytics', label: '分析', icon: BarChart2 },
  { id: 'security', label: '安全', icon: ShieldCheck },
  { id: 'updates', label: '版本更新', icon: RefreshCw },
  { id: 'about', label: '关于', icon: Info }
]

const getSessionDisplayName = (session: Pick<ChatSession, 'username' | 'displayName'>): string =>
  displayNameOrFallback(session.username, session.displayName)

const filteredTabs = tabs.filter(tab => {
  if (tab.id === 'autoDownload') {
    return (window as any).electronAPI.process.platform === 'win32' && (window as any).electronAPI.process.arch === 'x64'
  }
  return true
})

const isMac = navigator.userAgent.toLowerCase().includes('mac')
const isLinux = navigator.userAgent.toLowerCase().includes('linux')
const isWindows = !isMac && !isLinux

const dbDirName = '数据根目录'
const dbPathPlaceholder = '请输入或选择数据所在的根目录'


type SessionFilterType = configService.MessagePushSessionType
type SessionFilterTypeValue = 'all' | SessionFilterType
type SessionFilterMode = 'all' | 'whitelist' | 'blacklist'

interface SessionFilterOption {
  username: string
  displayName: string
  avatarUrl?: string
  type: SessionFilterType
}

const sessionFilterTypeOptions: Array<{ value: SessionFilterTypeValue; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'private', label: '私聊' },
  { value: 'group', label: '群聊' },
  { value: 'official', label: '订阅号/服务号' },
  { value: 'other', label: '其他/非好友' }
]

interface SettingsPageProps {
  onClose?: () => void
}

function SettingsPage({ onClose }: SettingsPageProps = {}) {
  const location = useLocation()
  const {
    isDbConnected,
    setDbConnected,
    setLoading,
    reset,
    updateInfo,
    setUpdateInfo,
    isDownloading,
    setIsDownloading,
    downloadProgress,
    setDownloadProgress,
    showUpdateDialog,
    setShowUpdateDialog,
  } = useAppStore()

  const chatSessions = useChatStore((state) => state.sessions)
  const resetChatStore = useChatStore((state) => state.reset)
  const { currentTheme, themeMode, setTheme, setThemeMode } = useThemeStore()
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const effectiveMode = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode
  const clearAnalyticsStoreCache = useAnalyticsStore((state) => state.clearCache)

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const [decryptKey, setDecryptKey] = useState('')
  const [imageXorKey, setImageXorKey] = useState('')
  const [imageAesKey, setImageAesKey] = useState('')
  const [dbPath, setDbPath] = useState('')
  const [accountId, setAccountId] = useState('')
  const [cachePath, setCachePath] = useState('')
  const [wcdbLibPath, setWcdbLibPath] = useState('')
  const [keyProviderPath, setKeyProviderPath] = useState('')
  const [imageNativeAddonPath, setImageNativeAddonPath] = useState('')
  const [welivePath, setWelivePath] = useState('')
  const [imgHelperLibPath, setImgHelperLibPath] = useState('')
  const [imgHelperProcessName, setImgHelperProcessName] = useState('')
  const [systemAccountId, setSystemAccountId] = useState('')
  const [imageKeyProgress, setImageKeyProgress] = useState(0)
  const [imageKeyPercent, setImageKeyPercent] = useState<number | null>(null)

  const [logEnabled, setLogEnabled] = useState(false)
  const [autoDownloadHighRes, setAutoDownloadHighRes] = useState(false)

  // 自动下载图片
  const [autoDownloadStatus, setAutoDownloadStatus] = useState<{ isHooked: boolean; pid: number | null; supported: boolean } | null>(null)
  const [autoDownloadSelectedIds, setAutoDownloadSelectedIds] = useState<Set<string>>(new Set())
  const [autoDownloadSearchKeyword, setAutoDownloadSearchKeyword] = useState('')

  const [whisperModelName, setWhisperModelName] = useState('base')
  const [whisperModelDir, setWhisperModelDir] = useState('')
  const [isWhisperDownloading, setIsWhisperDownloading] = useState(false)
  const [whisperDownloadProgress, setWhisperDownloadProgress] = useState(0)
  const [whisperProgressData, setWhisperProgressData] = useState<{ downloaded: number; total: number; speed: number }>({ downloaded: 0, total: 0, speed: 0 })
  const [whisperModelStatus, setWhisperModelStatus] = useState<{ exists: boolean; modelPath?: string; tokensPath?: string } | null>(null)

  const [httpApiToken, setHttpApiToken] = useState('')

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const generateRandomToken = async () => {
    // 生成 32 字符的十六进制随机字符串 (16 bytes)
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    const token = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')

    setHttpApiToken(token)
    await configService.setHttpApiToken(token)
    showMessage('已生成并保存新的 Access Token', true)
  }

  const clearApiToken = async () => {
    setHttpApiToken('')
    await configService.setHttpApiToken('')
    showMessage('已清除 Access Token，API 将允许无鉴权访问', true)
  }



  const [autoTranscribeVoice, setAutoTranscribeVoice] = useState(false)
  const [transcribeLanguages, setTranscribeLanguages] = useState<string[]>(['zh'])

  const [notificationEnabled, setNotificationEnabled] = useState(true)
  const [notificationPosition, setNotificationPosition] = useState<'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center'>('top-right')
  const [notificationFilterMode, setNotificationFilterMode] = useState<'all' | 'whitelist' | 'blacklist'>('all')
  const [notificationFilterList, setNotificationFilterList] = useState<string[]>([])
  const [launchAtStartup, setLaunchAtStartup] = useState(false)
  const [launchAtStartupSupported, setLaunchAtStartupSupported] = useState(isWindows || isMac)
  const [launchAtStartupReason, setLaunchAtStartupReason] = useState('')
  const [silentStartup, setSilentStartup] = useState(false)
  const [windowCloseBehavior, setWindowCloseBehavior] = useState<configService.WindowCloseBehavior>('ask')
  const [quoteLayout, setQuoteLayout] = useState<configService.QuoteLayout>('quote-top')
  const [updateChannel, setUpdateChannel] = useState<configService.UpdateChannel>('stable')
  const [filterSearchKeyword, setFilterSearchKeyword] = useState('')
  const [notificationTypeFilter, setNotificationTypeFilter] = useState<SessionFilterTypeValue>('all')
  const [filterModeDropdownOpen, setFilterModeDropdownOpen] = useState(false)
  const [positionDropdownOpen, setPositionDropdownOpen] = useState(false)
  const [closeBehaviorDropdownOpen, setCloseBehaviorDropdownOpen] = useState(false)

  const [wordCloudExcludeWords, setWordCloudExcludeWords] = useState<string[]>([])
  const [excludeWordsInput, setExcludeWordsInput] = useState('')

  // 数据收集同意状态
  const [analyticsConsent, setAnalyticsConsent] = useState<boolean>(false)





  const [isLoading, setIsLoadingState] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isFetchingDbKey, setIsFetchingDbKey] = useState(false)
  const [isFetchingImageKey, setIsFetchingImageKey] = useState(false)
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [isUpdatingLaunchAtStartup, setIsUpdatingLaunchAtStartup] = useState(false)
  const [isUpdatingSilentStartup, setIsUpdatingSilentStartup] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null)
  const [showDecryptKey, setShowDecryptKey] = useState(false)
  const [dbKeyStatus, setDbKeyStatus] = useState('')
  const [dbKeyError, setDbKeyError] = useState('')
  const [imageKeyStatus, setImageKeyStatus] = useState('')
  const [isManualStartPrompt, setIsManualStartPrompt] = useState(false)
  const [isClearingAnalyticsCache, setIsClearingAnalyticsCache] = useState(false)
  const [isClearingImageCache, setIsClearingImageCache] = useState(false)
  const [isClearingAllCache, setIsClearingAllCache] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // 安全设置 state
  const [authEnabled, setAuthEnabled] = useState(false)
  const [authUseHello, setAuthUseHello] = useState(false)
  const [helloAvailable, setHelloAvailable] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [helloPassword, setHelloPassword] = useState('')
  const [disableLockPassword, setDisableLockPassword] = useState('')
  const [showDisableLockInput, setShowDisableLockInput] = useState(false)
  const [isLockMode, setIsLockMode] = useState(false)
  const [isSettingHello, setIsSettingHello] = useState(false)

  // HTTP API 设置 state
  const [httpApiEnabled, setHttpApiEnabled] = useState(false)
  const [httpApiPort, setHttpApiPort] = useState(5031)
  const [httpApiHost, setHttpApiHost] = useState('127.0.0.1')
  const [httpApiRunning, setHttpApiRunning] = useState(false)
  const [httpApiMediaExportPath, setHttpApiMediaExportPath] = useState('')
  const [isTogglingApi, setIsTogglingApi] = useState(false)
  const [showApiWarning, setShowApiWarning] = useState(false)
  const [messagePushEnabled, setMessagePushEnabled] = useState(false)
  const [messagePushFilterMode, setMessagePushFilterMode] = useState<configService.MessagePushFilterMode>('all')
  const [messagePushFilterList, setMessagePushFilterList] = useState<string[]>([])
  const [messagePushFilterDropdownOpen, setMessagePushFilterDropdownOpen] = useState(false)
  const [messagePushFilterSearchKeyword, setMessagePushFilterSearchKeyword] = useState('')
  const [messagePushTypeFilter, setMessagePushTypeFilter] = useState<SessionFilterTypeValue>('all')
  const [messagePushContactOptions, setMessagePushContactOptions] = useState<ContactInfo[]>([])
  const [antiRevokeSessions, setAntiRevokeSessions] = useState<ChatSession[]>([])
  const [antiRevokeSearchKeyword, setAntiRevokeSearchKeyword] = useState('')
  const [antiRevokeSelectedIds, setAntiRevokeSelectedIds] = useState<Set<string>>(new Set())
  const [antiRevokeStatusMap, setAntiRevokeStatusMap] = useState<Record<string, { installed?: boolean; loading?: boolean; error?: string }>>({})
  const [isAntiRevokeRefreshing, setIsAntiRevokeRefreshing] = useState(false)
  const [isAntiRevokeInstalling, setIsAntiRevokeInstalling] = useState(false)
  const [isAntiRevokeUninstalling, setIsAntiRevokeUninstalling] = useState(false)
  const [antiRevokeSummary, setAntiRevokeSummary] = useState<{ action: 'refresh' | 'install' | 'uninstall'; success: number; failed: number } | null>(null)

  const isClearingCache = isClearingAnalyticsCache || isClearingImageCache || isClearingAllCache

  // 检查 Hello 可用性
  useEffect(() => {
    setHelloAvailable(isWindows)
  }, [])

  // 检查 HTTP API 服务状态
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const status = await window.electronAPI.http.status()
        setHttpApiRunning(status.running)
        if (status.port) {
          setHttpApiPort(status.port)
        }
        if (status.mediaExportPath) {
          setHttpApiMediaExportPath(status.mediaExportPath)
        }
      } catch (e) {
        console.error('检查 API 状态失败:', e)
      }
    }
    checkApiStatus()
  }, [])

  useEffect(() => {
    loadConfig()
    loadAppVersion()
    return () => {
      Object.values(saveTimersRef.current).forEach((timer) => clearTimeout(timer))
    }
  }, [])

  useEffect(() => {
    const initialTab = (location.state as { initialTab?: SettingsTab } | null)?.initialTab
    if (!initialTab) return
    setActiveTab(initialTab)
  }, [location.state])

  useEffect(() => {
    if (!onClose) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const removeDb = window.electronAPI.key.onDbKeyStatus((payload: { message: string; level: number }) => {
      setDbKeyStatus(payload.message)
    })

    const removeImage = window.electronAPI.key.onImageKeyStatus((payload: { message: string, percent?: number }) => {
      let msg = payload.message;
      let pct = payload.percent;

      // 如果后端没有显式传 percent，则用正则从字符串中提取如 "(12.5%)"
      if (pct === undefined) {
        const match = msg.match(/\(([\d.]+)%\)/);
        if (match) {
          pct = parseFloat(match[1]);
          // 将百分比从文本中剥离，让 UI 更清爽
          msg = msg.replace(/\s*\([\d.]+%\)/, '');
        }
      }

      setImageKeyStatus(msg);
      if (pct !== undefined) {
        setImageKeyPercent(pct);
      } else if (msg.includes('启动多核') || msg.includes('定位') || msg.includes('准备')) {
        // 预热阶段
        setImageKeyPercent(0);
      }
    })
    return () => {
      removeDb?.()
      removeImage?.()
    }
  }, [])

  // 点击外部关闭自定义下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.custom-select')) {
        setFilterModeDropdownOpen(false)
        setPositionDropdownOpen(false)
        setCloseBehaviorDropdownOpen(false)
        setMessagePushFilterDropdownOpen(false)
      }
    }
    if (filterModeDropdownOpen || positionDropdownOpen || closeBehaviorDropdownOpen || messagePushFilterDropdownOpen) {
      document.addEventListener('click', handleClickOutside)
    }
    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [closeBehaviorDropdownOpen, filterModeDropdownOpen, messagePushFilterDropdownOpen, positionDropdownOpen])


  const loadConfig = async () => {
    try {
      const savedKey = await configService.getDecryptKey()
      const savedPath = await configService.getDbPath()
      const savedAccountId = await configService.getMyAccountId()
      const savedCachePath = await configService.getCachePath()

      const savedExportPath = await configService.getExportPath()
      const savedLogEnabled = await configService.getLogEnabled()
      const savedImageXorKey = await configService.getImageXorKey()
      const savedImageAesKey = await configService.getImageAesKey()
      const savedWhisperModelName = await configService.getWhisperModelName()
      const savedWhisperModelDir = await configService.getWhisperModelDir()
      const savedAutoTranscribe = await configService.getAutoTranscribeVoice()
      const savedTranscribeLanguages = await configService.getTranscribeLanguages()
      const savedNotificationEnabled = await configService.getNotificationEnabled()
      const savedNotificationPosition = await configService.getNotificationPosition()
      const savedNotificationFilterMode = await configService.getNotificationFilterMode()
      const savedNotificationFilterList = await configService.getNotificationFilterList()
      const savedMessagePushEnabled = await configService.getMessagePushEnabled()
      const savedMessagePushFilterMode = await configService.getMessagePushFilterMode()
      const savedMessagePushFilterList = await configService.getMessagePushFilterList()
      const contactsResult = await window.electronAPI.chat.getContacts({ lite: true })
      const savedLaunchAtStartupStatus = await window.electronAPI.app.getLaunchAtStartupStatus()
      const savedSilentStartup = await configService.getSilentStartup()
      const savedWindowCloseBehavior = await configService.getWindowCloseBehavior()
      const savedQuoteLayout = await configService.getQuoteLayout()
      const savedUpdateChannel = await configService.getUpdateChannel()

      const savedAuthEnabled = await window.electronAPI.auth.verifyEnabled()
      const savedAuthUseHello = await configService.getAuthUseHello()
      const savedIsLockMode = await window.electronAPI.auth.isLockMode()

      const savedHttpApiToken = await configService.getHttpApiToken()
      if (savedHttpApiToken) setHttpApiToken(savedHttpApiToken)

      const savedApiPort = await configService.getHttpApiPort()
      if (savedApiPort) setHttpApiPort(savedApiPort)

      const savedApiHost = await configService.getHttpApiHost()
      if (savedApiHost) setHttpApiHost(savedApiHost)

      setAuthEnabled(savedAuthEnabled)
      setAuthUseHello(savedAuthUseHello)
      setIsLockMode(savedIsLockMode)

      if (savedPath) setDbPath(savedPath)
      if (savedAccountId) setAccountId(savedAccountId)
      if (savedCachePath) setCachePath(savedCachePath)

      setWcdbLibPath(await configService.getWcdbLibPath())
      setKeyProviderPath(await configService.getKeyProviderPath())
      setImageNativeAddonPath(await configService.getImageNativeAddonPath())
      setWelivePath(await configService.getWelivePath())
      setImgHelperLibPath(await configService.getImgHelperLibPath())
      setImgHelperProcessName(await configService.getImgHelperProcessName())
      setSystemAccountId(await configService.getSystemAccountId())


      const accountConfig = savedAccountId ? await configService.getAccountConfig(savedAccountId) : null
      const decryptKeyToUse = accountConfig?.decryptKey ?? savedKey ?? ''
      const imageXorKeyToUse = typeof accountConfig?.imageXorKey === 'number'
        ? accountConfig.imageXorKey
        : savedImageXorKey
      const imageAesKeyToUse = accountConfig?.imageAesKey ?? savedImageAesKey ?? ''

      setDecryptKey(decryptKeyToUse)
      if (typeof imageXorKeyToUse === 'number') {
        setImageXorKey(`0x${imageXorKeyToUse.toString(16).toUpperCase().padStart(2, '0')}`)
      } else {
        setImageXorKey('')
      }
      setImageAesKey(imageAesKeyToUse)
      setLogEnabled(savedLogEnabled)
      setAutoTranscribeVoice(savedAutoTranscribe)
      setTranscribeLanguages(savedTranscribeLanguages)

      setNotificationEnabled(savedNotificationEnabled)
      setNotificationPosition(savedNotificationPosition)
      setNotificationFilterMode(savedNotificationFilterMode)
      setNotificationFilterList(savedNotificationFilterList)
      setMessagePushEnabled(savedMessagePushEnabled)
      setMessagePushFilterMode(savedMessagePushFilterMode)
      setMessagePushFilterList(savedMessagePushFilterList)
      if (contactsResult.success && Array.isArray(contactsResult.contacts)) {
        setMessagePushContactOptions(contactsResult.contacts as ContactInfo[])
      }
      setLaunchAtStartup(savedLaunchAtStartupStatus.enabled)
      setLaunchAtStartupSupported(savedLaunchAtStartupStatus.supported)
      setLaunchAtStartupReason(savedLaunchAtStartupStatus.reason || '')
      setSilentStartup(savedSilentStartup)
      setWindowCloseBehavior(savedWindowCloseBehavior)
      setQuoteLayout(savedQuoteLayout)
      if (savedUpdateChannel) {
        setUpdateChannel(savedUpdateChannel)
      } else {
        const currentVersion = await window.electronAPI.app.getVersion()
        if (/^0\.\d{2}\.\d+$/i.test(currentVersion) || /-preview\.\d+\.\d+$/i.test(currentVersion)) {
          setUpdateChannel('preview')
        } else if (/^\d{2}\.\d{1,2}\.\d{1,2}$/i.test(currentVersion) || /-dev\.\d+\.\d+\.\d+$/i.test(currentVersion) || /(alpha|beta|rc)/i.test(currentVersion)) {
          setUpdateChannel('dev')
        } else {
          setUpdateChannel('stable')
        }
      }

      const savedExcludeWords = await configService.getWordCloudExcludeWords()
      setWordCloudExcludeWords(savedExcludeWords)
      setExcludeWordsInput(savedExcludeWords.join('\n'))

      const savedAutoDownloadHighRes = await configService.getAutoDownloadHighRes()
      const savedAutoDownloadWhitelist = await configService.getAutoDownloadWhitelist()
      const savedAnalyticsConsent = await configService.getAnalyticsConsent()
      setAnalyticsConsent(savedAnalyticsConsent ?? false)
      setAutoDownloadHighRes(savedAutoDownloadHighRes)
      setAutoDownloadSelectedIds(new Set(savedAutoDownloadWhitelist))


      // 如果语言列表为空，保存默认值
      if (!savedTranscribeLanguages || savedTranscribeLanguages.length === 0) {
        const defaultLanguages = ['zh']
        setTranscribeLanguages(defaultLanguages)
        await configService.setTranscribeLanguages(defaultLanguages)
      }


      if (savedWhisperModelDir) setWhisperModelDir(savedWhisperModelDir)

    } catch (e: any) {
      console.error('加载配置失败:', e)
    }
  }



  const handleLaunchAtStartupChange = async (enabled: boolean) => {
    if (isUpdatingLaunchAtStartup) return

    try {
      setIsUpdatingLaunchAtStartup(true)
      const result = await window.electronAPI.app.setLaunchAtStartup(enabled)
      setLaunchAtStartup(result.enabled)
      setLaunchAtStartupSupported(result.supported)
      setLaunchAtStartupReason(result.reason || '')

      if (result.success) {
        showMessage(enabled ? '已开启开机自启动' : '已关闭开机自启动', true)
        return
      }

      showMessage(result.error || result.reason || '设置开机自启动失败', false)
    } catch (e: any) {
      showMessage(`设置开机自启动失败: ${e?.message || String(e)}`, false)
    } finally {
      setIsUpdatingLaunchAtStartup(false)
    }
  }

  const handleSilentStartupChange = async (enabled: boolean) => {
    if (isUpdatingSilentStartup) return

    try {
      setIsUpdatingSilentStartup(true)
      await configService.setSilentStartup(enabled)
      setSilentStartup(enabled)
      showMessage(enabled ? '已开启静默启动' : '已关闭静默启动', true)
    } catch (e: any) {
      showMessage(`设置静默启动失败: ${e?.message || String(e)}`, false)
    } finally {
      setIsUpdatingSilentStartup(false)
    }
  }

  const refreshWhisperStatus = async (modelDirValue = whisperModelDir) => {
    try {
      const result = await window.electronAPI.whisper?.getModelStatus()
      if (result?.success) {
        setWhisperModelStatus({
          exists: Boolean(result.exists),
          modelPath: result.modelPath,
          tokensPath: result.tokensPath
        })
      }
    } catch {
      setWhisperModelStatus(null)
    }
  }

  const loadAppVersion = async () => {
    try {
      const version = await window.electronAPI.app.getVersion()
      setAppVersion(version)
    } catch (e: any) {
      console.error('获取版本号失败:', e)
    }
  }

  // 监听下载进度
  useEffect(() => {
    const removeListener = window.electronAPI.app.onDownloadProgress?.((progress: any) => {
      setDownloadProgress(progress)
    })
    return () => removeListener?.()
  }, [])

  useEffect(() => {
    const removeListener = window.electronAPI.whisper?.onDownloadProgress?.((payload: { modelName: string; downloadedBytes: number; totalBytes?: number; percent?: number; speed?: number }) => {
      setWhisperProgressData({
        downloaded: payload.downloadedBytes,
        total: payload.totalBytes || 0,
        speed: payload.speed || 0
      })
      if (typeof payload.percent === 'number') {
        setWhisperDownloadProgress(payload.percent)
      }
    })
    return () => removeListener?.()
  }, [])

  useEffect(() => {
    void refreshWhisperStatus(whisperModelDir)
  }, [whisperModelDir])

  useEffect(() => {
    if (activeTab === 'autoDownload') {
      fetchAutoDownloadStatus()

      let interval: ReturnType<typeof setInterval> | undefined
      if (autoDownloadHighRes) {
        interval = setInterval(fetchAutoDownloadStatus, 2000)
      }

      return () => {
        if (interval) clearInterval(interval)
      }
    }
  }, [activeTab, autoDownloadHighRes])

  const getErrorMessage = (error: any): string => {
    const raw = typeof error?.message === 'string' ? error.message : String(error ?? '')
    const normalized = raw.replace(/^Error:\s*/i, '').trim()
    return normalized || '未知错误'
  }

  const handleCheckUpdate = async () => {
    if (isCheckingUpdate) return
    setIsCheckingUpdate(true)
    setUpdateInfo(null)
    try {
      const result = await window.electronAPI.app.checkForUpdates()
      if (result.hasUpdate) {
        setUpdateInfo(result)
        setShowUpdateDialog(true)
        showMessage(`发现新版：${result.version}`, true)
      } else {
        showMessage('当前已是最新版', true)
      }
    } catch (e: any) {
      showMessage(`检查更新失败: ${getErrorMessage(e)}`, false)
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const handleUpdateNow = async () => {
    setShowUpdateDialog(false)

    setIsDownloading(true)
    setDownloadProgress({ percent: 0 })
    try {
      showMessage('正在下载更新...', true)
      await window.electronAPI.app.downloadAndInstall()
    } catch (e: any) {
      showMessage(`更新失败: ${getErrorMessage(e)}`, false)
      setIsDownloading(false)
    }
  }

  const handleIgnoreUpdate = async () => {
    if (!updateInfo || !updateInfo.version) return

    try {
      await window.electronAPI.app.ignoreUpdate(updateInfo.version)
      setShowUpdateDialog(false)
      setUpdateInfo(null)
      showMessage(`已忽略版本 ${updateInfo.version}`, true)
    } catch (e: any) {
      showMessage(`操作失败: ${e}`, false)
    }
  }

  const handleUpdateChannelChange = async (channel: configService.UpdateChannel) => {
    if (channel === updateChannel) return

    try {
      setUpdateChannel(channel)
      await configService.setUpdateChannel(channel)
      await configService.setIgnoredUpdateVersion('')
      setUpdateInfo(null)
      setShowUpdateDialog(false)
      const channelLabel = channel === 'stable' ? '稳定版' : channel === 'preview' ? '预览版' : '开发版'
      showMessage(`已切换到${channelLabel}更新渠道，正在检查更新`, true)
      await handleCheckUpdate()
    } catch (e: any) {
      showMessage(`切换更新渠道失败: ${e}`, false)
    }
  }

  const showMessage = (text: string, success: boolean) => {
    setMessage({ text, success })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleClose = () => {
    if (!onClose) return
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 200)
  }

  const normalizeSessionIds = (sessionIds: string[]): string[] =>
    Array.from(new Set((sessionIds || []).map((id) => String(id || '').trim()).filter(Boolean)))

  const getCurrentAntiRevokeSessionIds = (): string[] =>
    normalizeSessionIds(antiRevokeSessions.map((session) => session.username))

  const ensureAntiRevokeSessionsLoaded = async (): Promise<string[]> => {
    const current = getCurrentAntiRevokeSessionIds()
    if (current.length > 0) return current
    const sessionsResult = await window.electronAPI.chat.getAntiRevokeSessions()
    if (!sessionsResult.success || !sessionsResult.sessions) {
      throw new Error(sessionsResult.error || '加载会话失败')
    }
    const nextSessions = sessionsResult.sessions
    const nextIds = normalizeSessionIds(nextSessions.map((session) => session.username))
    setAntiRevokeSessions(nextSessions)
    setAntiRevokeSelectedIds((prev) => {
      const allowed = new Set(nextIds)
      return new Set(Array.from(prev).filter((sessionId) => allowed.has(sessionId)))
    })
    setAntiRevokeStatusMap((prev) => {
      const allowed = new Set(nextIds)
      return Object.fromEntries(Object.entries(prev).filter(([sessionId]) => allowed.has(sessionId)))
    })
    return nextIds
  }

  const markAntiRevokeRowsLoading = (sessionIds: string[]) => {
    setAntiRevokeStatusMap((prev) => {
      const next = { ...prev }
      for (const sessionId of sessionIds) {
        next[sessionId] = {
          ...(next[sessionId] || {}),
          loading: true,
          error: undefined
        }
      }
      return next
    })
  }

  const handleRefreshAntiRevokeStatus = async (sessionIds?: string[]) => {
    if (isAntiRevokeRefreshing || isAntiRevokeInstalling || isAntiRevokeUninstalling) return
    setAntiRevokeSummary(null)
    setIsAntiRevokeRefreshing(true)
    try {
      const targetIds = normalizeSessionIds(
        sessionIds && sessionIds.length > 0
          ? sessionIds
          : await ensureAntiRevokeSessionsLoaded()
      )
      if (targetIds.length === 0) {
        setAntiRevokeStatusMap({})
        showMessage('暂无可检查的会话', true)
        return
      }
      markAntiRevokeRowsLoading(targetIds)

      const result = await window.electronAPI.chat.checkAntiRevokeTriggers(targetIds)
      if (!result.success || !result.rows) {
        const errorText = result.error || '防撤回状态检查失败'
        setAntiRevokeStatusMap((prev) => {
          const next = { ...prev }
          for (const sessionId of targetIds) {
            next[sessionId] = {
              ...(next[sessionId] || {}),
              loading: false,
              error: errorText
            }
          }
          return next
        })
        showMessage(errorText, false)
        return
      }

      const rowMap = new Map<string, { sessionId: string; success: boolean; installed?: boolean; error?: string }>()
      for (const row of result.rows || []) {
        const sessionId = String(row.sessionId || '').trim()
        if (!sessionId) continue
        rowMap.set(sessionId, row)
      }
      const mergedRows = targetIds.map((sessionId) => (
        rowMap.get(sessionId) || { sessionId, success: false, error: '状态查询未返回结果' }
      ))
      const successCount = mergedRows.filter((row) => row.success).length
      const failedCount = mergedRows.length - successCount
      setAntiRevokeStatusMap((prev) => {
        const next = { ...prev }
        for (const row of mergedRows) {
          const sessionId = String(row.sessionId || '').trim()
          if (!sessionId) continue
          next[sessionId] = {
            installed: row.installed === true,
            loading: false,
            error: row.success ? undefined : (row.error || '状态查询失败')
          }
        }
        return next
      })
      setAntiRevokeSummary({ action: 'refresh', success: successCount, failed: failedCount })
      showMessage(`状态刷新完成：成功 ${successCount}，失败 ${failedCount}`, failedCount === 0)
    } catch (e: any) {
      showMessage(`防撤回状态刷新失败: ${e?.message || String(e)}`, false)
    } finally {
      setIsAntiRevokeRefreshing(false)
    }
  }

  const handleInstallAntiRevokeTriggers = async () => {
    if (isAntiRevokeRefreshing || isAntiRevokeInstalling || isAntiRevokeUninstalling) return
    const sessionIds = normalizeSessionIds(Array.from(antiRevokeSelectedIds))
    if (sessionIds.length === 0) {
      showMessage('请先选择至少一个会话', false)
      return
    }
    setAntiRevokeSummary(null)
    setIsAntiRevokeInstalling(true)
    try {
      markAntiRevokeRowsLoading(sessionIds)
      const result = await window.electronAPI.chat.installAntiRevokeTriggers(sessionIds)
      if (!result.success || !result.rows) {
        const errorText = result.error || '批量安装失败'
        setAntiRevokeStatusMap((prev) => {
          const next = { ...prev }
          for (const sessionId of sessionIds) {
            next[sessionId] = {
              ...(next[sessionId] || {}),
              loading: false,
              error: errorText
            }
          }
          return next
        })
        showMessage(errorText, false)
        return
      }

      const rowMap = new Map<string, { sessionId: string; success: boolean; alreadyInstalled?: boolean; error?: string }>()
      for (const row of result.rows || []) {
        const sessionId = String(row.sessionId || '').trim()
        if (!sessionId) continue
        rowMap.set(sessionId, row)
      }
      const mergedRows = sessionIds.map((sessionId) => (
        rowMap.get(sessionId) || { sessionId, success: false, error: '安装未返回结果' }
      ))
      const successCount = mergedRows.filter((row) => row.success).length
      const failedCount = mergedRows.length - successCount
      setAntiRevokeStatusMap((prev) => {
        const next = { ...prev }
        for (const row of mergedRows) {
          const sessionId = String(row.sessionId || '').trim()
          if (!sessionId) continue
          next[sessionId] = {
            installed: row.success ? true : next[sessionId]?.installed,
            loading: false,
            error: row.success ? undefined : (row.error || '安装失败')
          }
        }
        return next
      })
      setAntiRevokeSummary({ action: 'install', success: successCount, failed: failedCount })
      showMessage(`批量安装完成：成功 ${successCount}，失败 ${failedCount}`, failedCount === 0)
    } catch (e: any) {
      showMessage(`批量安装失败: ${e?.message || String(e)}`, false)
    } finally {
      setIsAntiRevokeInstalling(false)
    }
  }

  const handleUninstallAntiRevokeTriggers = async () => {
    if (isAntiRevokeRefreshing || isAntiRevokeInstalling || isAntiRevokeUninstalling) return
    const sessionIds = normalizeSessionIds(Array.from(antiRevokeSelectedIds))
    if (sessionIds.length === 0) {
      showMessage('请先选择至少一个会话', false)
      return
    }
    setAntiRevokeSummary(null)
    setIsAntiRevokeUninstalling(true)
    try {
      markAntiRevokeRowsLoading(sessionIds)
      const result = await window.electronAPI.chat.uninstallAntiRevokeTriggers(sessionIds)
      if (!result.success || !result.rows) {
        const errorText = result.error || '批量卸载失败'
        setAntiRevokeStatusMap((prev) => {
          const next = { ...prev }
          for (const sessionId of sessionIds) {
            next[sessionId] = {
              ...(next[sessionId] || {}),
              loading: false,
              error: errorText
            }
          }
          return next
        })
        showMessage(errorText, false)
        return
      }

      const rowMap = new Map<string, { sessionId: string; success: boolean; error?: string }>()
      for (const row of result.rows || []) {
        const sessionId = String(row.sessionId || '').trim()
        if (!sessionId) continue
        rowMap.set(sessionId, row)
      }
      const mergedRows = sessionIds.map((sessionId) => (
        rowMap.get(sessionId) || { sessionId, success: false, error: '卸载未返回结果' }
      ))
      const successCount = mergedRows.filter((row) => row.success).length
      const failedCount = mergedRows.length - successCount
      setAntiRevokeStatusMap((prev) => {
        const next = { ...prev }
        for (const row of mergedRows) {
          const sessionId = String(row.sessionId || '').trim()
          if (!sessionId) continue
          next[sessionId] = {
            installed: row.success ? false : next[sessionId]?.installed,
            loading: false,
            error: row.success ? undefined : (row.error || '卸载失败')
          }
        }
        return next
      })
      setAntiRevokeSummary({ action: 'uninstall', success: successCount, failed: failedCount })
      showMessage(`批量卸载完成：成功 ${successCount}，失败 ${failedCount}`, failedCount === 0)
    } catch (e: any) {
      showMessage(`批量卸载失败: ${e?.message || String(e)}`, false)
    } finally {
      setIsAntiRevokeUninstalling(false)
    }
  }

  useEffect(() => {
    if (activeTab !== 'antiRevoke' && activeTab !== 'autoDownload') return
    let canceled = false
    ;(async () => {
      try {
        await ensureAntiRevokeSessionsLoaded()
      } catch (e: any) {
        if (!canceled) {
          showMessage(`加载会话失败: ${e?.message || String(e)}`, false)
        }
      }
    })()
    return () => {
      canceled = true
    }
  }, [activeTab])

  type AccountKeys = {
    decryptKey: string
    imageXorKey: number | null
    imageAesKey: string
  }

  const formatImageXorKey = (value: number) => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`

  const parseImageXorKey = (value: string) => {
    if (!value) return null
    const parsed = parseInt(value.replace(/^0x/i, ''), 16)
    return Number.isNaN(parsed) ? null : parsed
  }

  const buildKeysFromState = (): AccountKeys => ({
    decryptKey: decryptKey || '',
    imageXorKey: parseImageXorKey(imageXorKey),
    imageAesKey: imageAesKey || ''
  })

  const buildKeysFromInputs = (overrides?: { decryptKey?: string; imageXorKey?: string; imageAesKey?: string }): AccountKeys => ({
    decryptKey: overrides?.decryptKey ?? decryptKey ?? '',
    imageXorKey: parseImageXorKey(overrides?.imageXorKey ?? imageXorKey),
    imageAesKey: overrides?.imageAesKey ?? imageAesKey ?? ''
  })

  const buildKeysFromConfig = (accountConfig: configService.AccountConfig | null): AccountKeys => ({
    decryptKey: accountConfig?.decryptKey || '',
    imageXorKey: typeof accountConfig?.imageXorKey === 'number' ? accountConfig.imageXorKey : null,
    imageAesKey: accountConfig?.imageAesKey || ''
  })

  const applyKeysToState = (keys: AccountKeys) => {
    setDecryptKey(keys.decryptKey)
    if (typeof keys.imageXorKey === 'number') {
      setImageXorKey(formatImageXorKey(keys.imageXorKey))
    } else {
      setImageXorKey('')
    }
    setImageAesKey(keys.imageAesKey)
  }

  const syncKeysToConfig = async (keys: AccountKeys) => {
    await configService.setDecryptKey(keys.decryptKey)
    await configService.setImageXorKey(typeof keys.imageXorKey === 'number' ? keys.imageXorKey : 0)
    await configService.setImageAesKey(keys.imageAesKey)
  }

  const validatePath = (path: string): string | null => {
    if (!path) return null
    if (/[\u4e00-\u9fa5]/.test(path)) {
      return '路径包含中文字符，请迁移至全英文目录'
    }
    return null
  }

  const handleSelectDbPath = async () => {
    try {
      const result = await dialog.openFile({ title: '选择数据库根目录', properties: ['openDirectory'] })
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0]
        const validationError = validatePath(selectedPath)
        if (validationError) {
          showMessage(validationError, false)
        } else {
          setDbPath(selectedPath)
          await configService.setDbPath(selectedPath)
          showMessage('已选择数据库目录', true)
        }
      }
    } catch (e: any) {
      showMessage('选择目录失败', false)
    }
  }

  const handleSelectThirdPartyPath = async (
    title: string,
    onSelected: (path: string) => Promise<void> | void
  ) => {
    try {
      const result = await dialog.openFile({ title, properties: ['openFile'] })
      if (!result.canceled && result.filePaths.length > 0) {
        await onSelected(result.filePaths[0])
        showMessage('已保存路径', true)
      }
    } catch (e: any) {
      showMessage('选择文件失败', false)
    }
  }

  const handleSelectWcdbLibPath = () => handleSelectThirdPartyPath('选择第三方 WCDB 实现库文件', async (path) => {
    setWcdbLibPath(path)
    await configService.setWcdbLibPath(path)
  })
  const handleSelectKeyProviderPath = () => handleSelectThirdPartyPath('选择第三方密钥获取工具', async (path) => {
    setKeyProviderPath(path)
    await configService.setKeyProviderPath(path)
  })
  const handleSelectImageNativeAddonPath = () => handleSelectThirdPartyPath('选择第三方媒体解密插件', async (path) => {
    setImageNativeAddonPath(path)
    await configService.setImageNativeAddonPath(path)
  })
  const handleSelectWelivePath = () => handleSelectThirdPartyPath('选择第三方 WeLive 导出引擎', async (path) => {
    setWelivePath(path)
    await configService.setWelivePath(path)
  })
  const handleSelectImgHelperLibPath = () => handleSelectThirdPartyPath('选择第三方原图下载组件', async (path) => {
    setImgHelperLibPath(path)
    await configService.setImgHelperLibPath(path)
  })

  const handleSelectCachePath = async () => {
    try {
      const result = await dialog.openFile({ title: '选择缓存目录', properties: ['openDirectory'] })
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0]
        setCachePath(selectedPath)
        await configService.setCachePath(selectedPath)
        showMessage('已选择缓存目录', true)
      }
    } catch (e: any) {
      showMessage('选择目录失败', false)
    }
  }



  const handleSelectWhisperModelDir = async () => {
    try {
      const result = await dialog.openFile({ title: '选择 Whisper 模型下载目录', properties: ['openDirectory'] })
      if (!result.canceled && result.filePaths.length > 0) {
        const dir = result.filePaths[0]
        setWhisperModelDir(dir)
        await configService.setWhisperModelDir(dir)
        showMessage('已选择 Whisper 模型目录', true)
      }
    } catch (e: any) {
      showMessage('选择目录失败', false)
    }
  }

  const handleWhisperModelChange = async (value: string) => {
    setWhisperModelName(value)
    setWhisperDownloadProgress(0)
    await configService.setWhisperModelName(value)
  }

  const handleDownloadWhisperModel = async () => {
    if (isWhisperDownloading) return
    setIsWhisperDownloading(true)
    setWhisperDownloadProgress(0)
    try {
      const result = await window.electronAPI.whisper.downloadModel()
      if (result.success) {
        setWhisperDownloadProgress(100)
        showMessage('SenseVoiceSmall 模型下载完成', true)
        await refreshWhisperStatus(whisperModelDir)
      } else {
        showMessage(result.error || '模型下载失败', false)
      }
    } catch (e: any) {
      showMessage(`模型下载失败: ${e}`, false)
    } finally {
      setIsWhisperDownloading(false)
    }
  }

  const handleResetWhisperModelDir = async () => {
    setWhisperModelDir('')
    await configService.setWhisperModelDir('')
  }

  const handleAutoGetDbKey = async () => {
    if (isFetchingDbKey) return
    window.electronAPI.key.trace?.('renderer:settings:click', { dbPath, accountId })
    setIsFetchingDbKey(true)
    setIsManualStartPrompt(false)
    setDbKeyError('')
    setDbKeyStatus('正在连接目标应用进程...')
    try {
      window.electronAPI.key.trace?.('renderer:settings:invoke-before', { dbPath, accountId })
      const result = await window.electronAPI.key.autoGetDbKey(dbPath, accountId)
      window.electronAPI.key.trace?.('renderer:settings:invoke-after', {
        success: result.success,
        hasKey: Boolean(result.key),
        accountId: result.accountId,
        error: result.error
      })
      if (result.success && result.key) {
        const resolvedAccountId = result.accountId || accountId
        setDecryptKey(result.key)
        if (resolvedAccountId) {
          setAccountId(resolvedAccountId)
          window.electronAPI.key.trace?.('renderer:settings:setMyAccountId-before', { resolvedAccountId })
          await configService.setMyAccountId(resolvedAccountId)
          window.electronAPI.key.trace?.('renderer:settings:setMyAccountId-after')
        }
        setDbKeyStatus('密钥获取成功')
        setDbKeyError('')
        showMessage('已自动获取解密密钥', true)
        window.electronAPI.key.trace?.('renderer:settings:syncKeys-before', { resolvedAccountId })
        await syncCurrentKeys({ decryptKey: result.key, accountId: resolvedAccountId })
        window.electronAPI.key.trace?.('renderer:settings:syncKeys-after')
      } else {
        if (
          result.error?.includes('未找到安装路径') ||
          result.error?.includes('启动失败') ||
          result.error?.includes('未能自动启动') ||
          result.error?.includes('未找到目标应用进程') ||
          result.error?.includes('目标应用进程未运行')
        ) {
          setIsManualStartPrompt(true)
          setDbKeyStatus('需要手动启动目标应用')
          setDbKeyError('')
        } else {
          const failureMessage = result.error || '自动获取密钥失败'
          setDbKeyError(failureMessage)
          showMessage(failureMessage, false)
        }
      }
    } catch (e: any) {
      window.electronAPI.key.trace?.('renderer:settings:error', { error: String(e) })
      const failureMessage = `自动获取密钥失败: ${e}`
      setDbKeyError(failureMessage)
      showMessage(failureMessage, false)
    } finally {
      window.electronAPI.key.trace?.('renderer:settings:finally')
      setIsFetchingDbKey(false)
    }
  }

  const handleManualConfirm = async () => {
    setIsManualStartPrompt(false)
    handleAutoGetDbKey()
  }

  // Debounce config writes to avoid excessive disk IO
  const scheduleConfigSave = (key: string, task: () => Promise<void> | void, delay = 300) => {
    const timers = saveTimersRef.current
    if (timers[key]) {
      clearTimeout(timers[key])
    }
    timers[key] = setTimeout(() => {
      Promise.resolve(task()).catch((e) => {
        console.error('保存配置失败:', e)
      })
    }, delay)
  }

  const syncCurrentKeys = async (options?: { decryptKey?: string; imageXorKey?: string; imageAesKey?: string; accountId?: string }) => {
    const keys = buildKeysFromInputs(options)
    await syncKeysToConfig(keys)
    const accountIdToUse = options?.accountId ?? accountId
    if (accountIdToUse) {
      await configService.setAccountConfig(accountIdToUse, {
        decryptKey: keys.decryptKey,
        imageXorKey: typeof keys.imageXorKey === 'number' ? keys.imageXorKey : 0,
        imageAesKey: keys.imageAesKey
      })
    }
  }

  const handleAutoGetImageKey = async () => {
    if (isFetchingImageKey) return;
    if (!dbPath) { showMessage('请先选择数据库目录', false); return; }
    setIsFetchingImageKey(true);
    setImageKeyPercent(0)
    setImageKeyStatus('正在初始化...');
    setImageKeyProgress(0);

    try {
      const accountPath = accountId ? `${dbPath}/${accountId}` : dbPath;
      const result = await window.electronAPI.key.autoGetImageKey(accountPath, accountId)
      if (result.success && result.aesKey) {
        if (typeof result.xorKey === 'number') setImageXorKey(`0x${result.xorKey.toString(16).toUpperCase().padStart(2, '0')}`)
        setImageAesKey(result.aesKey)
        setImageKeyStatus('已获取图片密钥')
        showMessage('已自动获取图片密钥', true)
        const newXorKey = typeof result.xorKey === 'number' ? result.xorKey : 0
        const newAesKey = result.aesKey
        await configService.setImageXorKey(newXorKey)
        await configService.setImageAesKey(newAesKey)
        if (accountId) await configService.setAccountConfig(accountId, { decryptKey, imageXorKey: newXorKey, imageAesKey: newAesKey })
      } else {
        showMessage(result.error || '自动获取图片密钥失败', false)
      }
    } catch (e: any) {
      showMessage(`自动获取图片密钥失败: ${e}`, false)
    } finally {
      setIsFetchingImageKey(false)
    }
  }

  const handleScanImageKeyFromMemory = async () => {
    if (isFetchingImageKey) return;
    if (!dbPath) { showMessage('请先选择数据库目录', false); return; }
    setIsFetchingImageKey(true);
    setImageKeyPercent(0)
    setImageKeyStatus('正在扫描内存...');

    try {
      const accountPath = accountId ? `${dbPath}/${accountId}` : dbPath;
      const result = await window.electronAPI.key.scanImageKeyFromMemory(accountPath)
      if (result.success && result.aesKey) {
        if (typeof result.xorKey === 'number') setImageXorKey(`0x${result.xorKey.toString(16).toUpperCase().padStart(2, '0')}`)
        setImageAesKey(result.aesKey)
        setImageKeyStatus('内存扫描成功，已获取图片密钥')
        showMessage('内存扫描成功，已获取图片密钥', true)
        const newXorKey = typeof result.xorKey === 'number' ? result.xorKey : 0
        const newAesKey = result.aesKey
        await configService.setImageXorKey(newXorKey)
        await configService.setImageAesKey(newAesKey)
        if (accountId) await configService.setAccountConfig(accountId, { decryptKey, imageXorKey: newXorKey, imageAesKey: newAesKey })
      } else {
        showMessage(result.error || '内存扫描获取图片密钥失败', false)
      }
    } catch (e: any) {
      showMessage(`内存扫描失败: ${e}`, false)
    } finally {
      setIsFetchingImageKey(false)
    }
  }



  const handleTestConnection = async () => {
    if (!dbPath) { showMessage('请先选择数据库目录', false); return }
    if (!decryptKey) { showMessage('请先输入解密密钥', false); return }
    if (decryptKey.length !== 64) { showMessage('密钥长度必须为64个字符', false); return }
    if (!accountId) { showMessage('请先输入账号 ID', false); return }

    setIsTesting(true)
    try {
      const result = await window.electronAPI.wcdb.testConnection(dbPath, decryptKey, accountId)
      if (result.success) {
        showMessage('连接测试成功！数据库可正常访问', true)
      } else {
        showMessage(result.error || '连接测试失败', false)
      }
    } catch (e: any) {
      showMessage(`连接测试失败: ${e}`, false)
    } finally {
      setIsTesting(false)
    }
  }

  // Removed manual save config function


  const handleClearConfig = async () => {
    const confirmed = window.confirm('确定要清除当前配置吗？清除后需要重新完成首次配置？')
    if (!confirmed) return
    setIsLoadingState(true)
    setLoading(true, '正在清除配置...')
    try {
      await window.electronAPI.wcdb.close()
      await configService.clearConfig()
      reset()
      setDecryptKey('')
      setImageXorKey('')
      setImageAesKey('')
      setDbPath('')
      setAccountId('')
      setCachePath('')
      setLogEnabled(false)
      setAutoTranscribeVoice(false)
      setTranscribeLanguages(['zh'])
      setWhisperModelDir('')
      setWhisperModelStatus(null)
      setWhisperDownloadProgress(0)
      setIsWhisperDownloading(false)
      setDbConnected(false)
      await window.electronAPI.window.openOnboardingWindow()
    } catch (e: any) {
      showMessage(`清除配置失败: ${e}`, false)
    } finally {
      setIsLoadingState(false)
      setLoading(false)
    }
  }

  const handleOpenLog = async () => {
    try {
      const logPath = await window.electronAPI.log.getPath()
      await window.electronAPI.shell.openPath(logPath)
    } catch (e: any) {
      showMessage(`打开日志失败: ${e}`, false)
    }
  }

  const handleCopyLog = async () => {
    try {
      const result = await window.electronAPI.log.read()
      if (!result.success) {
        showMessage(result.error || '读取日志失败', false)
        return
      }
      await navigator.clipboard.writeText(result.content || '')
      showMessage('日志已复制到剪贴板', true)
    } catch (e: any) {
      showMessage(`复制日志失败: ${e}`, false)
    }
  }

  const handleClearLog = async () => {
    const confirmed = window.confirm('确定清空 wcdb.log 吗？')
    if (!confirmed) return
    try {
      const result = await window.electronAPI.log.clear()
      if (!result.success) {
        showMessage(result.error || '清空日志失败', false)
        return
      }
      showMessage('日志已清空', true)
    } catch (e: any) {
      showMessage(`清空日志失败: ${e}`, false)
    }
  }

  const handleClearAnalyticsCache = async () => {
    if (isClearingCache) return
    setIsClearingAnalyticsCache(true)
    try {
      const result = await window.electronAPI.cache.clearAnalytics()
      if (result.success) {
        clearAnalyticsStoreCache()
        showMessage('已清除分析缓存', true)
      } else {
        showMessage(`清除分析缓存失败: ${result.error || '未知错误'}`, false)
      }
    } catch (e: any) {
      showMessage(`清除分析缓存失败: ${e}`, false)
    } finally {
      setIsClearingAnalyticsCache(false)
    }
  }

  const handleClearImageCache = async () => {
    if (isClearingCache) return
    setIsClearingImageCache(true)
    try {
      const result = await window.electronAPI.cache.clearImages()
      if (result.success) {
        showMessage('已清除图片缓存', true)
      } else {
        showMessage(`清除图片缓存失败: ${result.error || '未知错误'}`, false)
      }
    } catch (e: any) {
      showMessage(`清除图片缓存失败: ${e}`, false)
    } finally {
      setIsClearingImageCache(false)
    }
  }

  const handleClearAllCache = async () => {
    if (isClearingCache) return
    setIsClearingAllCache(true)
    try {
      const result = await window.electronAPI.cache.clearAll()
      if (result.success) {
        clearAnalyticsStoreCache()
        showMessage('已清除所有缓存', true)
      } else {
        showMessage(`清除所有缓存失败: ${result.error || '未知错误'}`, false)
      }
    } catch (e: any) {
      showMessage(`清除所有缓存失败: ${e}`, false)
    } finally {
      setIsClearingAllCache(false)
    }
  }

  const fetchAutoDownloadStatus = async () => {
    try {
      const status = await (window as any).electronAPI.image.getAutoDownloadStatus()
      setAutoDownloadStatus(status)
    } catch (error) {
      console.error('获取自动下载状态失败:', error)
    }
  }

  const renderAppearanceTab = () => (
    <div className="tab-content">
      <div className="theme-mode-toggle">
        <button className={`mode-btn ${themeMode === 'light' ? 'active' : ''}`} onClick={() => setThemeMode('light')}>
          <Sun size={16} /> 浅色
        </button>
        <button className={`mode-btn ${themeMode === 'dark' ? 'active' : ''}`} onClick={() => setThemeMode('dark')}>
          <Moon size={16} /> 深色
        </button>
        <button className={`mode-btn ${themeMode === 'system' ? 'active' : ''}`} onClick={() => setThemeMode('system')}>
          <Monitor size={16} /> 跟随系统
        </button>
      </div>
      <div className="theme-grid">
        {themes.map((theme) => (
          <div key={theme.id} className={`theme-card ${currentTheme === theme.id ? 'active' : ''}`} onClick={() => setTheme(theme.id)}>
            <div className="theme-preview" style={{
              background: effectiveMode === 'dark'
                ? (theme.id === 'blossom-dream' ? 'linear-gradient(150deg, #151316 0%, #1A1620 50%, #131018 100%)'
                  : theme.id === 'geist' ? 'linear-gradient(135deg, #1a1a1a 0%, #222222 100%)'
                  : 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)')
                : (theme.id === 'blossom-dream' ? `linear-gradient(150deg, ${theme.bgColor} 0%, #F8F2F8 45%, #F2F6FB 100%)`
                  : theme.id === 'geist' ? 'linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%)'
                  : `linear-gradient(135deg, ${theme.bgColor} 0%, ${theme.bgColor}dd 100%)`)
            }}>
              <div className="theme-accent" style={{
                background: theme.accentColor
                  ? `linear-gradient(135deg, ${theme.primaryColor} 0%, ${theme.accentColor} 100%)`
                  : theme.primaryColor
              }} />
            </div>
            <div className="theme-info">
              <span className="theme-name">{theme.name}</span>
              <span className="theme-desc">{theme.description}</span>
            </div>
            {currentTheme === theme.id && <div className="theme-check"><Check size={14} /></div>}
          </div>
        ))}
      </div>

      <div className="form-group quote-layout-group">
        <label>引用消息样式</label>
        <span className="form-hint">选择聊天中引用消息与正文的上下顺序，下方预览会同步展示布局差异。</span>
        <div className="quote-layout-picker" role="radiogroup" aria-label="引用样式选择">
          {[
            {
              value: 'quote-top' as const,
              label: '引用在上',
              successMessage: '已切换为引用在上样式'
            },
            {
              value: 'quote-bottom' as const,
              label: '正文在上',
              successMessage: '已切换为正文在上样式'
            }
          ].map(option => {
            const selected = quoteLayout === option.value
            const isQuoteBottom = option.value === 'quote-bottom'

            return (
              <button
                key={option.value}
                type="button"
                className={`quote-layout-card ${selected ? 'active' : ''}`}
                onClick={async () => {
                  if (selected) return
                  setQuoteLayout(option.value)
                  await configService.setQuoteLayout(option.value)
                  window.dispatchEvent(new CustomEvent('quote-layout-changed', { detail: option.value }))
                  showMessage(option.successMessage, true)
                }}
                role="radio"
                aria-checked={selected}
              >
                <span className={`quote-layout-card-check ${selected ? 'active' : ''}`} aria-hidden="true" />
                <div className="quote-layout-preview-shell">
                  <div className="quote-layout-preview-chat">
                    <div className="message-bubble sent">
                      <div className={`bubble-content ${isQuoteBottom ? 'quote-layout-bottom' : 'quote-layout-top'}`}>
                        {isQuoteBottom ? (
                          <>
                            <div className="message-text">拍得真不错!</div>
                            <div className="ambient-reply-wrapper">
                              <div className="reply-anchor">
                                <svg className="reply-anchor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 14 4 9 9 4" />
                                  <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                                </svg>
                                <span className="reply-anchor-name">张三</span>
                                <span className="reply-anchor-sep">&middot;</span>
                                <span className="reply-anchor-excerpt">那天去爬山的照片...</span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="ambient-reply-wrapper">
                              <div className="reply-anchor">
                                <svg className="reply-anchor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 14 4 9 9 4" />
                                  <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                                </svg>
                                <span className="reply-anchor-name">张三</span>
                                <span className="reply-anchor-sep">&middot;</span>
                                <span className="reply-anchor-excerpt">那天去爬山的照片...</span>
                              </div>
                            </div>
                            <div className="message-text">拍得真不错!</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="quote-layout-card-footer">
                  <div className="quote-layout-card-title-group">
                    <span className="quote-layout-card-title">{option.label}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="divider" />

      <div className="form-group">
        <label>开机自启动</label>
        <span className="form-hint">
          {launchAtStartupSupported
            ? '开启后，登录系统时会自动启动 WeFlow。'
            : launchAtStartupReason || '当前环境暂不支持开机自启动。'}
        </span>
        <div className="log-toggle-line">
          <span className="log-status">
            {isUpdatingLaunchAtStartup
              ? '保存中...'
              : launchAtStartupSupported
                ? (launchAtStartup ? '已开启' : '已关闭')
                : '当前不可用'}
          </span>
          <label className="switch" htmlFor="launch-at-startup-toggle">
            <input
              id="launch-at-startup-toggle"
              className="switch-input"
              type="checkbox"
              checked={launchAtStartup}
              disabled={!launchAtStartupSupported || isUpdatingLaunchAtStartup}
              onChange={(e) => {
                void handleLaunchAtStartupChange(e.target.checked)
              }}
            />
            <span className="switch-slider" />
          </label>
        </div>
      </div>

      <div className="divider" />

      <div className="form-group">
        <label>静默启动</label>
        <span className="form-hint">
          开启后，无论手动启动还是开机自启动，都会先驻留到系统托盘，不主动显示主窗口。
        </span>
        <div className="log-toggle-line">
          <span className="log-status">
            {isUpdatingSilentStartup
              ? '保存中...'
              : (silentStartup ? '已开启' : '已关闭')}
          </span>
          <label className="switch" htmlFor="silent-startup-toggle">
            <input
              id="silent-startup-toggle"
              className="switch-input"
              type="checkbox"
              checked={silentStartup}
              disabled={isUpdatingSilentStartup}
              onChange={(e) => {
                void handleSilentStartupChange(e.target.checked)
              }}
            />
            <span className="switch-slider" />
          </label>
        </div>
      </div>

      <div className="divider" />

      <div className="form-group">
        <label>关闭主窗口时</label>
        <span className="form-hint">设置点击关闭按钮后的默认行为；选择“每次询问”时会弹出关闭确认。</span>
        <div className="custom-select">
          <div
            className={`custom-select-trigger ${closeBehaviorDropdownOpen ? 'open' : ''}`}
            onClick={() => setCloseBehaviorDropdownOpen(!closeBehaviorDropdownOpen)}
          >
            <span className="custom-select-value">
              {windowCloseBehavior === 'tray'
                ? '最小化到系统托盘'
                : windowCloseBehavior === 'quit'
                  ? '完全关闭'
                  : '每次询问'}
            </span>
            <ChevronDown size={14} className={`custom-select-arrow ${closeBehaviorDropdownOpen ? 'rotate' : ''}`} />
          </div>
          <div className={`custom-select-dropdown ${closeBehaviorDropdownOpen ? 'open' : ''}`}>
            {[
              {
                value: 'ask' as const,
                label: '每次询问',
                successMessage: '已恢复关闭确认弹窗'
              },
              {
                value: 'tray' as const,
                label: '最小化到系统托盘',
                successMessage: '关闭按钮已改为最小化到托盘'
              },
              {
                value: 'quit' as const,
                label: '完全关闭',
                successMessage: '关闭按钮已改为完全关闭'
              }
            ].map(option => (
              <div
                key={option.value}
                className={`custom-select-option ${windowCloseBehavior === option.value ? 'selected' : ''}`}
                onClick={async () => {
                  setWindowCloseBehavior(option.value)
                  setCloseBehaviorDropdownOpen(false)
                  await configService.setWindowCloseBehavior(option.value)
                  showMessage(option.successMessage, true)
                }}
              >
                {option.label}
                {windowCloseBehavior === option.value && <Check size={14} />}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )

  const renderNotificationTab = () => {
    // 添加会话到过滤列表
    const handleAddToFilterList = async (username: string) => {
      if (notificationFilterList.includes(username)) return
      const newList = [...notificationFilterList, username]
      setNotificationFilterList(newList)
      await configService.setNotificationFilterList(newList)
      showMessage('已添加到过滤列表', true)
    }

    // 从过滤列表移除会话
    const handleRemoveFromFilterList = async (username: string) => {
      const newList = notificationFilterList.filter(u => u !== username)
      setNotificationFilterList(newList)
      await configService.setNotificationFilterList(newList)
      showMessage('已从过滤列表移除', true)
    }

    return (
      <div className="tab-content">
        <div className="form-group">
          <label>新消息通知</label>
          <span className="form-hint">开启后，收到新消息时将显示桌面弹窗通知</span>
          <div className="log-toggle-line">
            <span className="log-status">{notificationEnabled ? '已开启' : '已关闭'}</span>
            <label className="switch" htmlFor="notification-enabled-toggle">
              <input
                id="notification-enabled-toggle"
                className="switch-input"
                type="checkbox"
                checked={notificationEnabled}
                onChange={async (e) => {
                  const val = e.target.checked
                  setNotificationEnabled(val)
                  await configService.setNotificationEnabled(val)
                  showMessage(val ? '已开启通知' : '已关闭通知', true)
                }}
              />
              <span className="switch-slider" />
            </label>
          </div>
        </div>

        <div className="form-group">
          <label>通知显示位置</label>
          <span className="form-hint">选择通知弹窗在屏幕上的显示位置</span>
          <div className="custom-select">
            <div
              className={`custom-select-trigger ${positionDropdownOpen ? 'open' : ''}`}
              onClick={() => setPositionDropdownOpen(!positionDropdownOpen)}
            >
              <span className="custom-select-value">
                {notificationPosition === 'top-right' ? '右上角' :
                  notificationPosition === 'bottom-right' ? '右下角' :
                    notificationPosition === 'top-left' ? '左上角' :
                      notificationPosition === 'top-center' ? '中间上方' : '左下角'}
              </span>
              <ChevronDown size={14} className={`custom-select-arrow ${positionDropdownOpen ? 'rotate' : ''}`} />
            </div>
            <div className={`custom-select-dropdown ${positionDropdownOpen ? 'open' : ''}`}>
              {[
                { value: 'top-center', label: '中间上方' },
                { value: 'top-right', label: '右上角' },
                { value: 'bottom-right', label: '右下角' },
                { value: 'top-left', label: '左上角' },
                { value: 'bottom-left', label: '左下角' }
              ].map(option => (
                <div
                  key={option.value}
                  className={`custom-select-option ${notificationPosition === option.value ? 'selected' : ''}`}
                  onClick={async () => {
                    const val = option.value as 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center'
                    setNotificationPosition(val)
                    setPositionDropdownOpen(false)
                    await configService.setNotificationPosition(val)
                    showMessage('通知位置已更新', true)
                  }}
                >
                  {option.label}
                  {notificationPosition === option.value && <Check size={14} />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>会话过滤</label>
          <span className="form-hint">选择只接收特定会话的通知，或屏蔽特定会话的通知</span>
          <div className="custom-select">
            <div
              className={`custom-select-trigger ${filterModeDropdownOpen ? 'open' : ''}`}
              onClick={() => setFilterModeDropdownOpen(!filterModeDropdownOpen)}
            >
              <span className="custom-select-value">
                {notificationFilterMode === 'all' ? '接收所有通知' :
                  notificationFilterMode === 'whitelist' ? '仅接收白名单' : '屏蔽黑名单'}
              </span>
              <ChevronDown size={14} className={`custom-select-arrow ${filterModeDropdownOpen ? 'rotate' : ''}`} />
            </div>
            <div className={`custom-select-dropdown ${filterModeDropdownOpen ? 'open' : ''}`}>
              {[
                { value: 'all', label: '接收所有通知' },
                { value: 'whitelist', label: '仅接收白名单' },
                { value: 'blacklist', label: '屏蔽黑名单' }
              ].map(option => (
                <div
                  key={option.value}
                  className={`custom-select-option ${notificationFilterMode === option.value ? 'selected' : ''}`}
                  onClick={() => { void handleSetNotificationFilterMode(option.value as SessionFilterMode) }}
                >
                  {option.label}
                  {notificationFilterMode === option.value && <Check size={14} />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {notificationFilterMode !== 'all' && (
          <div className="form-group">
            <label>{notificationFilterMode === 'whitelist' ? '白名单会话' : '黑名单会话'}</label>
            <span className="form-hint">
              {notificationFilterMode === 'whitelist'
                ? '点击左侧会话添加到白名单，点击右侧会话从白名单移除'
                : '点击左侧会话添加到黑名单，点击右侧会话从黑名单移除'}
            </span>

            <div className="push-filter-type-tabs">
              {sessionFilterTypeOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`push-filter-type-tab ${notificationTypeFilter === option.value ? 'active' : ''}`}
                  onClick={() => setNotificationTypeFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="notification-filter-container">
              {/* 可选会话列表 */}
              <div className="filter-panel">
                <div className="filter-panel-header">
                  <span>可选会话</span>
                  {notificationAvailableSessions.length > 0 && (
                    <button
                      type="button"
                      className="filter-panel-action"
                      onClick={() => { void handleAddAllNotificationFilterSessions() }}
                    >
                      全选当前
                    </button>
                  )}
                  <div className="filter-search-box">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder="搜索会话..."
                      value={filterSearchKeyword}
                      onChange={(e) => setFilterSearchKeyword(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-panel-list">
                  {notificationAvailableSessions.length > 0 ? (
                    notificationAvailableSessions.map(session => {
                      const displayName = getSessionDisplayName(session)
                      return (
                        <div
                          key={session.username}
                          className="filter-panel-item"
                          onClick={() => handleAddToFilterList(session.username)}
                        >
                          <Avatar
                            src={session.avatarUrl}
                            name={displayName}
                            size={28}
                          />
                          <span className="filter-item-name">{displayName}</span>
                          <span className="filter-item-type">{getSessionFilterTypeLabel(session.type)}</span>
                          <span className="filter-item-action">+</span>
                        </div>
                      )
                    })
                  ) : (
                    <div className="filter-panel-empty">
                      {filterSearchKeyword || notificationTypeFilter !== 'all' ? '没有匹配的会话' : '暂无可添加的会话'}
                    </div>
                  )}
                </div>
              </div>

              {/* 已选会话列表 */}
              <div className="filter-panel">
                <div className="filter-panel-header">
                  <span>{notificationFilterMode === 'whitelist' ? '白名单' : '黑名单'}</span>
                  {notificationFilterList.length > 0 && (
                    <span className="filter-panel-count">{notificationFilterList.length}</span>
                  )}
                  {notificationFilterList.length > 0 && (
                    <button
                      type="button"
                      className="filter-panel-action"
                      onClick={() => { void handleRemoveAllNotificationFilterSessions() }}
                    >
                      全不选
                    </button>
                  )}
                </div>
                <div className="filter-panel-list">
                  {notificationFilterList.length > 0 ? (
                    notificationFilterList.map(username => {
                      const info = getSessionFilterOptionInfo(username)
                      return (
                        <div
                          key={username}
                          className="filter-panel-item selected"
                          onClick={() => handleRemoveFromFilterList(username)}
                        >
                          <Avatar
                            src={info.avatarUrl}
                            name={info.displayName}
                            size={28}
                          />
                          <span className="filter-item-name">{info.displayName}</span>
                          <span className="filter-item-type">{getSessionFilterTypeLabel(info.type)}</span>
                          <span className="filter-item-action">×</span>
                        </div>
                      )
                    })
                  ) : (
                    <div className="filter-panel-empty">尚未添加任何会话</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderAntiRevokeTab = () => {
    const sortedSessions = [...antiRevokeSessions].sort((a, b) => (b.sortTimestamp || 0) - (a.sortTimestamp || 0))
    const keyword = antiRevokeSearchKeyword.trim().toLowerCase()
    const filteredSessions = sortedSessions.filter((session) => {
      if (!keyword) return true
      const displayName = String(session.displayName || '').toLowerCase()
      const username = String(session.username || '').toLowerCase()
      return displayName.includes(keyword) || username.includes(keyword)
    })
    const filteredSessionIds = filteredSessions.map((session) => session.username)
    const selectedCount = antiRevokeSelectedIds.size
    const selectedInFilteredCount = filteredSessionIds.filter((sessionId) => antiRevokeSelectedIds.has(sessionId)).length
    const allFilteredSelected = filteredSessionIds.length > 0 && selectedInFilteredCount === filteredSessionIds.length
    const busy = isAntiRevokeRefreshing || isAntiRevokeInstalling || isAntiRevokeUninstalling
    const statusStats = filteredSessions.reduce(
      (acc, session) => {
        const rowState = antiRevokeStatusMap[session.username]
        if (rowState?.error) acc.failed += 1
        else if (rowState?.installed === true) acc.installed += 1
        else if (rowState?.installed === false) acc.notInstalled += 1
        return acc
      },
      { installed: 0, notInstalled: 0, failed: 0 }
    )

    const toggleSelected = (sessionId: string) => {
      setAntiRevokeSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(sessionId)) next.delete(sessionId)
        else next.add(sessionId)
        return next
      })
    }

    const selectAllFiltered = () => {
      if (filteredSessionIds.length === 0) return
      setAntiRevokeSelectedIds((prev) => {
        const next = new Set(prev)
        for (const sessionId of filteredSessionIds) {
          next.add(sessionId)
        }
        return next
      })
    }

    const clearSelection = () => {
      setAntiRevokeSelectedIds(new Set())
    }

    return (
      <div className="tab-content anti-revoke-tab">
        <div className="anti-revoke-hero">
          <div className="anti-revoke-hero-main">
            <h3>防撤回</h3>
            <p>你可以根据会话进行防撤回部署，安装后无需保持 WeFlow 运行即可实现防撤回</p>
          </div>
          <div className="anti-revoke-metrics">
            <div className="anti-revoke-metric is-total">
              <span className="label">筛选会话</span>
              <span className="value">{filteredSessionIds.length}</span>
            </div>
            <div className="anti-revoke-metric is-installed">
              <span className="label">已安装</span>
              <span className="value">{statusStats.installed}</span>
            </div>
            <div className="anti-revoke-metric is-pending">
              <span className="label">未安装</span>
              <span className="value">{statusStats.notInstalled}</span>
            </div>
            <div className="anti-revoke-metric is-error">
              <span className="label">异常</span>
              <span className="value">{statusStats.failed}</span>
            </div>
          </div>
        </div>

        <div className="anti-revoke-control-card">
          <div className="anti-revoke-toolbar">
            <div className="filter-search-box anti-revoke-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="搜索会话..."
                value={antiRevokeSearchKeyword}
                onChange={(e) => setAntiRevokeSearchKeyword(e.target.value)}
              />
            </div>
            <div className="anti-revoke-toolbar-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => void handleRefreshAntiRevokeStatus()} disabled={busy}>
                <RefreshCw size={14} /> {isAntiRevokeRefreshing ? '刷新中...' : '刷新状态'}
              </button>
            </div>
          </div>

          <div className="anti-revoke-selection-strip">
            <div className="anti-revoke-selected-count">
              <span>已选 <strong>{selectedCount}</strong> 个会话</span>
              <span>筛选命中 <strong>{selectedInFilteredCount}</strong> / {filteredSessionIds.length}</span>
            </div>
            <div className="anti-revoke-selection-actions">
              <button className="btn btn-secondary btn-sm" onClick={selectAllFiltered} disabled={busy || filteredSessionIds.length === 0 || allFilteredSelected}>
                全选
              </button>
              <button className="btn btn-secondary btn-sm" onClick={clearSelection} disabled={busy || selectedCount === 0}>
                清空选择
              </button>
            </div>
          </div>

          <div className="anti-revoke-batch-actions">
            <div className="anti-revoke-batch-copy">
              <span className="anti-revoke-section-label">批量部署</span>
              <span>对已选会话执行防撤回安装或卸载</span>
            </div>
            <div className="anti-revoke-btn-group anti-revoke-batch-btns">
              <button className="btn btn-primary btn-sm" onClick={() => void handleInstallAntiRevokeTriggers()} disabled={busy || selectedCount === 0}>
                {isAntiRevokeInstalling ? '安装中...' : '批量安装'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => void handleUninstallAntiRevokeTriggers()} disabled={busy || selectedCount === 0}>
                {isAntiRevokeUninstalling ? '卸载中...' : '批量卸载'}
              </button>
            </div>
          </div>
        </div>

        {antiRevokeSummary && (
          <div className={`anti-revoke-summary ${antiRevokeSummary.failed > 0 ? 'error' : 'success'}`}>
            {antiRevokeSummary.action === 'refresh' ? '刷新' : antiRevokeSummary.action === 'install' ? '安装' : '卸载'}
            完成：成功 {antiRevokeSummary.success}，失败 {antiRevokeSummary.failed}
          </div>
        )}

        <div className="anti-revoke-list">
          {filteredSessions.length === 0 ? (
            <div className="anti-revoke-empty">{antiRevokeSearchKeyword ? '没有匹配的会话' : '暂无会话可配置'}</div>
          ) : (
            <>
              <div className="anti-revoke-list-header">
                <span>会话（{filteredSessions.length}）</span>
                <span>状态</span>
              </div>
              {filteredSessions.map((session) => {
                const rowState = antiRevokeStatusMap[session.username]
                let statusClass = 'unknown'
                let statusLabel = '未检查'
                if (rowState?.loading) {
                  statusClass = 'checking'
                  statusLabel = '检查中'
                } else if (rowState?.error) {
                  statusClass = 'error'
                  statusLabel = '失败'
                } else if (rowState?.installed === true) {
                  statusClass = 'installed'
                  statusLabel = '已安装'
                } else if (rowState?.installed === false) {
                  statusClass = 'not-installed'
                  statusLabel = '未安装'
                }
                return (
                  <div key={session.username} className={`anti-revoke-row ${antiRevokeSelectedIds.has(session.username) ? 'selected' : ''}`}>
                    <label className="anti-revoke-row-main">
                      <span className="anti-revoke-check">
                        <input
                          type="checkbox"
                          checked={antiRevokeSelectedIds.has(session.username)}
                          onChange={() => toggleSelected(session.username)}
                          disabled={busy}
                        />
                        <span className="check-indicator" aria-hidden="true">
                          <Check size={12} />
                        </span>
                      </span>
                      <Avatar
                        src={session.avatarUrl}
                        name={getSessionDisplayName(session)}
                        size={30}
                      />
                      <div className="anti-revoke-row-text">
                        <span className="name">{getSessionDisplayName(session)}</span>
                      </div>
                    </label>
                    <div className="anti-revoke-row-status">
                      <span className={`status-badge ${statusClass}`}>
                        <i className="status-dot" aria-hidden="true" />
                        {statusLabel}
                      </span>
                      {rowState?.error && <span className="status-error">{rowState.error}</span>}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    )
  }

  const renderDatabaseTab = () => (
    <div className="tab-content">
      <div className="form-group">
        <label>连接测试</label>
        <span className="form-hint">检测当前数据库配置是否可用</span>
        <button className="btn btn-secondary" onClick={handleTestConnection} disabled={isLoading || isTesting}>
          <Plug size={16} /> {isTesting ? '测试中...' : '测试连接'}
        </button>
      </div>

      <div className="divider" />

      <div className="form-group">
        <label>解密密钥</label>
        <span className="form-hint">64位十六进制密钥</span>
        <div className="input-with-toggle">
          <input
            type={showDecryptKey ? 'text' : 'password'}
            placeholder="例如: a1b2c3d4e5f6..."
            value={decryptKey}
            onChange={(e) => {
              const value = e.target.value
              setDecryptKey(value)
              if (value && value.length === 64) {
                scheduleConfigSave('keys', () => syncCurrentKeys({ decryptKey: value, accountId }))
                // showMessage('解密密钥已保存', true)
              }
            }}
          />
          <button type="button" className="toggle-visibility" onClick={() => setShowDecryptKey(!showDecryptKey)}>
            {showDecryptKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {isManualStartPrompt ? (
          <div className="manual-prompt">
            <p className="prompt-text">未能自动启动目标应用，请手动启动，看到登录窗口后点击下方确认</p>
            <button className="btn btn-primary btn-sm" onClick={handleManualConfirm}>
              我已看到登录窗口，继续检测
            </button>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={handleAutoGetDbKey} disabled={isFetchingDbKey}>
            <Plug size={14} /> {isFetchingDbKey ? '获取中...' : '自动获取密钥'}
          </button>
        )}
        {dbKeyStatus && <div className="form-hint status-text">{dbKeyStatus}</div>}
      </div>

      <div className="form-group">
        <label>数据库根目录</label>
        <span className="form-hint">数据所在的根目录</span>
        <input
          type="text"
          placeholder={dbPathPlaceholder}
          value={dbPath}
          onChange={(e) => {
            const value = e.target.value
            setDbPath(value)
            scheduleConfigSave('dbPath', async () => {
              if (value) {
                await configService.setDbPath(value)
              }
            })
          }}
        />
        <div className="btn-row">
          <button className="btn btn-secondary" onClick={handleSelectDbPath}><FolderOpen size={16} /> 浏览选择</button>
        </div>
      </div>



      <div className="form-group">
        <label>账号 ID</label>
        <span className="form-hint">账号标识</span>
        <div className="accountId-input-wrapper">
          <input
            type="text"
            placeholder="例如: accountId_xxxxxx"
            value={accountId}
            onChange={(e) => {
              const value = e.target.value
              const previousAccountId = accountId
              setAccountId(value)
              scheduleConfigSave('accountId', async () => {
                if (previousAccountId && previousAccountId !== value) {
                  const currentKeys = buildKeysFromState()
                  await configService.setAccountConfig(previousAccountId, {
                    decryptKey: currentKeys.decryptKey,
                    imageXorKey: typeof currentKeys.imageXorKey === 'number' ? currentKeys.imageXorKey : 0,
                    imageAesKey: currentKeys.imageAesKey
                  })
                }
                if (value) {
                  await configService.setMyAccountId(value)
                  await syncCurrentKeys({ accountId: value }) // Sync keys to the new accountId entry
                }

                if (value && previousAccountId !== value) {
                  if (isDbConnected) {
                    try {
                      await window.electronAPI.chat.close()
                      const result = await window.electronAPI.chat.connect()
                      setDbConnected(result.success, dbPath || undefined)
                      if (!result.success && result.error) {
                        showMessage(result.error, false)
                      }
                    } catch (e: any) {
                      showMessage(`切换账号后重新连接失败: ${e}`, false)
                      setDbConnected(false)
                    }
                  }
                  clearAnalyticsStoreCache()
                  resetChatStore()
                  window.dispatchEvent(new CustomEvent('accountId-changed', { detail: { accountId: value } }))
                }
              })
            }}
          />
        </div>
      </div>

      <div className="form-group">
        <label>图片 XOR 密钥 <span className="optional">(可选)</span></label>
        <span className="form-hint">用于解密图片缓存</span>
        <input
          type="text"
          placeholder="例如: 0xA4"
          value={imageXorKey}
          onChange={(e) => {
            const value = e.target.value
            setImageXorKey(value)
            const parsed = parseImageXorKey(value)
            if (value === '' || parsed !== null) {
              scheduleConfigSave('keys', () => syncCurrentKeys({ imageXorKey: value, accountId }))
            }
          }}
        />
      </div>

      <div className="form-group">
        <label>图片 AES 密钥 <span className="optional">(可选)</span></label>
        <span className="form-hint">16 位密钥</span>
        <input
          type="text"
          placeholder="16 位 AES 密钥"
          value={imageAesKey}
          onChange={(e) => {
            const value = e.target.value
            setImageAesKey(value)
            scheduleConfigSave('keys', () => syncCurrentKeys({ imageAesKey: value, accountId }))
          }}
        />
        <div className="image-key-actions">
          <button className="btn btn-primary btn-sm" onClick={handleAutoGetImageKey} disabled={isFetchingImageKey} title="从本地缓存快速计算">
            <Plug size={14} /> {isFetchingImageKey ? '获取中...' : '缓存计算（推荐）'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleScanImageKeyFromMemory} disabled={isFetchingImageKey} title="扫描目标应用进程内存">
            {isFetchingImageKey ? '扫描中...' : '内存扫描'}
          </button>
        </div>
        {isFetchingImageKey ? (
          <div className="brute-force-progress">
            <div className="status-header">
              <span className="status-text">{imageKeyStatus || '正在启动...'}</span>
            </div>
          </div>
        ) : (
          imageKeyStatus && <div className="form-hint status-text" style={{ marginTop: '8px' }}>{imageKeyStatus}</div>
        )}
        <span className="form-hint">优先推荐缓存计算方案。若图片无法解密，可使用内存扫描（需目标应用运行并打开 2-3 张图片大图）</span>
      </div>

      <div className="divider" />

      <div className="form-group">
        <label>第三方组件路径</label>
        <span className="form-hint">
          WeFlow 不再内置数据解密相关的原生组件，以下四项均需自行提供符合接口约定的实现，留空则对应功能返回"未配置"提示
        </span>
      </div>

      <div className="form-group">
        <label>WCDB 实现路径</label>
        <span className="form-hint">用于读取目标应用数据库的动态库文件（.dll/.so/.dylib）</span>
        <input
          type="text"
          placeholder="未配置"
          value={wcdbLibPath}
          onChange={(e) => {
            const value = e.target.value
            setWcdbLibPath(value)
            scheduleConfigSave('wcdbLibPath', () => configService.setWcdbLibPath(value))
          }}
        />
        <button className="btn btn-secondary btn-sm" onClick={handleSelectWcdbLibPath}><FolderOpen size={14} /> 浏览选择</button>
      </div>

      <div className="form-group">
        <label>密钥获取工具路径</label>
        <span className="form-hint">用于获取数据库密钥/图片密钥的可执行文件，详见密钥获取工具协议文档</span>
        <input
          type="text"
          placeholder="未配置"
          value={keyProviderPath}
          onChange={(e) => {
            const value = e.target.value
            setKeyProviderPath(value)
            scheduleConfigSave('keyProviderPath', () => configService.setKeyProviderPath(value))
          }}
        />
        <button className="btn btn-secondary btn-sm" onClick={handleSelectKeyProviderPath}><FolderOpen size={14} /> 浏览选择</button>
      </div>

      <div className="form-group">
        <label>媒体解密插件路径</label>
        <span className="form-hint">用于解密语音/图片/视频的 Node 原生插件（.node）</span>
        <input
          type="text"
          placeholder="未配置"
          value={imageNativeAddonPath}
          onChange={(e) => {
            const value = e.target.value
            setImageNativeAddonPath(value)
            scheduleConfigSave('imageNativeAddonPath', () => configService.setImageNativeAddonPath(value))
          }}
        />
        <button className="btn btn-secondary btn-sm" onClick={handleSelectImageNativeAddonPath}><FolderOpen size={14} /> 浏览选择</button>
      </div>

      <div className="form-group">
        <label>WeLive 导出引擎路径</label>
        <span className="form-hint">用于批量原始导出的外部可执行文件</span>
        <input
          type="text"
          placeholder="未配置"
          value={welivePath}
          onChange={(e) => {
            const value = e.target.value
            setWelivePath(value)
            scheduleConfigSave('welivePath', () => configService.setWelivePath(value))
          }}
        />
        <button className="btn btn-secondary btn-sm" onClick={handleSelectWelivePath}><FolderOpen size={14} /> 浏览选择</button>
      </div>

      <div className="form-group">
        <label>系统保留账号 ID <span className="optional">(可选)</span></label>
        <span className="form-hint">目标应用自身的系统通知账号 ID，配置后会从会话列表/统计中排除</span>
        <input
          type="text"
          placeholder="未配置"
          value={systemAccountId}
          onChange={(e) => {
            const value = e.target.value
            setSystemAccountId(value)
            scheduleConfigSave('systemAccountId', () => configService.setSystemAccountId(value))
          }}
        />
      </div>

      <div className="divider" />

      <div className="form-group">
        <label>调试日志</label>
        <span className="form-hint">开启后写入 WCDB 调试日志，便于排查连接问题</span>
        <div className="log-toggle-line">
          <span className="log-status">{logEnabled ? '已开启' : '已关闭'}</span>
          <label className="switch" htmlFor="log-enabled-toggle">
            <input
              id="log-enabled-toggle"
              className="switch-input"
              type="checkbox"
              checked={logEnabled}
              onChange={async (e) => {
                const enabled = e.target.checked
                setLogEnabled(enabled)
                await configService.setLogEnabled(enabled)
                showMessage(enabled ? '已开启日志' : '已关闭日志', true)
              }}
            />
            <span className="switch-slider" />
          </label>
        </div>
        <div className="log-actions">
          <button className="btn btn-secondary" onClick={handleOpenLog}>
            <FolderOpen size={16} /> 打开日志文件
          </button>
          <button className="btn btn-secondary" onClick={handleCopyLog}>
            <Copy size={16} /> 复制日志内容
          </button>
          <button className="btn btn-secondary" onClick={handleClearLog}>
            <Trash2 size={16} /> 清空日志
          </button>
        </div>
      </div>

    </div>
  )
  const resolvedWhisperModelPath = whisperModelDir || whisperModelStatus?.modelPath || ''

  const renderModelsTab = () => (
    <div className="tab-content">
      <div className="form-group">
        <label>语音识别模型 (Whisper)</label>
        <span className="form-hint">用于语音消息转文字功能</span>

        <div className="setting-control vertical has-border">
          <div className="model-status-card">
            <div className="model-info">
              <div className="model-name-row">
                <div className="model-name">SenseVoiceSmall</div>
                <span className="model-size">245 MB</span>
              </div>
              <div className="model-meta">
                {whisperModelStatus?.exists ? (
                  <span className="status-indicator success"><Check size={14} /> 已安装</span>
                ) : (
                  <span className="status-indicator warning">未安装</span>
                )}
              </div>
            </div>
            {(!whisperModelStatus?.exists || isWhisperDownloading) && (
              <div className="model-actions">
                {!whisperModelStatus?.exists && !isWhisperDownloading && (
                  <button
                    className="btn-download"
                    onClick={handleDownloadWhisperModel}
                  >
                    <Download size={16} /> 下载模型
                  </button>
                )}
                {isWhisperDownloading && (
                  <div className="download-status">
                    <div className="status-header">
                      <span className="percent">{Math.round(whisperDownloadProgress)}%</span>
                      {whisperProgressData.total > 0 && (
                        <span className="details">
                          {formatBytes(whisperProgressData.downloaded)} / {formatBytes(whisperProgressData.total)}
                          <span className="speed">({formatBytes(whisperProgressData.speed)}/s)</span>
                        </span>
                      )}
                    </div>
                    <div className="progress-bar-mini">
                      <div className="fill" style={{ width: `${whisperDownloadProgress}%` }}></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="model-directory-control">
              <input
                type="text"
                value={resolvedWhisperModelPath}
                readOnly
                placeholder="默认目录"
                title={resolvedWhisperModelPath || '默认目录'}
              />
              <button className="btn btn-secondary btn-sm" onClick={handleSelectWhisperModelDir} title="选择自定义目录">
                <FolderOpen size={14} /> 选择自定义目录
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleResetWhisperModelDir} disabled={!whisperModelDir} title="恢复默认">
                <RotateCcw size={14} /> 恢复默认
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="form-group">
        <label>自动转文字</label>
        <span className="form-hint">收到语音消息时自动转换为文字</span>
        <div className="log-toggle-line">
          <span className="log-status">{autoTranscribeVoice ? '已开启' : '已关闭'}</span>
          <label className="switch">
            <input
              type="checkbox"
              className="switch-input"
              checked={autoTranscribeVoice}
              onChange={(e) => {
                setAutoTranscribeVoice(e.target.checked)
                configService.setAutoTranscribeVoice(e.target.checked)
              }}
            />
            <span className="switch-slider"></span>
          </label>
        </div>
      </div>

    </div>
  )

  const renderCacheTab = () => (
      <div className="tab-content">
        <p className="section-desc">管理应用缓存数据</p>
        <div className="form-group">
          <label>缓存目录 <span className="optional">(可选)</span></label>
          <span className="form-hint">留空使用默认目录</span>
          <input
              type="text"
              placeholder="留空使用默认目录"
              value={cachePath}
              onChange={(e) => {
                const value = e.target.value
                setCachePath(value)
                scheduleConfigSave('cachePath', () => configService.setCachePath(value))
              }}
          />

          <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            当前缓存位置：
            <code style={{
              background: 'var(--bg-secondary)',
              padding: '3px 6px',
              borderRadius: '4px',
              userSelect: 'all',
              wordBreak: 'break-all',
              marginLeft: '4px'
            }}>
              {cachePath || (isMac ? '~/Documents/WeFlow' : isLinux ? '~/Documents/WeFlow' : '系统 文档\\WeFlow 目录')}
            </code>
          </div>

          <div className="btn-row" style={{ marginTop: '12px' }}>
            <button className="btn btn-secondary" onClick={handleSelectCachePath}><FolderOpen size={16} /> 浏览选择</button>
            <button
                className="btn btn-secondary"
                onClick={async () => {
                  setCachePath('')
                  await configService.setCachePath('')
                }}
            >
              <RotateCcw size={16} /> 恢复默认
            </button>
          </div>
        </div>

      <div className="btn-row">
        <button className="btn btn-secondary" onClick={handleClearAnalyticsCache} disabled={isClearingCache}>
          <Trash2 size={16} /> 清除分析缓存
        </button>
        <button className="btn btn-secondary" onClick={handleClearImageCache} disabled={isClearingCache}>
          <Trash2 size={16} /> 清除图片缓存
        </button>
        <button className="btn btn-danger" onClick={handleClearAllCache} disabled={isClearingCache}>
          <Trash2 size={16} /> 清除所有缓存</button>
      </div>
      <div className="divider" />
      <p className="section-desc">清除当前配置并重新开始首次引导</p>
      <div className="btn-row">
        <button className="btn btn-danger" onClick={handleClearConfig}>
          <RefreshCw size={16} /> 清除当前配置
        </button>
      </div>
    </div>
  )

  // HTTP API 服务控制
  const handleToggleApi = async () => {
    if (isTogglingApi) return

    // 启动时显示警告弹窗
    if (!httpApiRunning) {
      setShowApiWarning(true)
      return
    }

    setIsTogglingApi(true)
    try {
      await window.electronAPI.http.stop()
      setHttpApiRunning(false)
      await configService.setHttpApiEnabled(false)
      showMessage('API 服务已停止', true)
    } catch (e: any) {
      showMessage(`操作失败: ${e}`, false)
    } finally {
      setIsTogglingApi(false)
    }
  }

  // 确认启动 API 服务
  const confirmStartApi = async () => {
    setShowApiWarning(false)
    setIsTogglingApi(true)
    try {
      const result = await window.electronAPI.http.start(httpApiPort, httpApiHost)
      if (result.success) {
        setHttpApiRunning(true)
        if (result.port) setHttpApiPort(result.port)

        await configService.setHttpApiEnabled(true)
        await configService.setHttpApiPort(result.port || httpApiPort)

        showMessage(`API 服务已启动，端口 ${result.port}`, true)
      } else {
        showMessage(`启动失败: ${result.error}`, false)
      }
    } catch (e: any) {
      showMessage(`操作失败: ${e}`, false)
    } finally {
      setIsTogglingApi(false)
    }
  }

  const handleCopyApiUrl = () => {
    const url = `http://${httpApiHost}:${httpApiPort}`
    navigator.clipboard.writeText(url)
    showMessage('已复制 API 地址', true)
  }

  const handleToggleMessagePush = async (enabled: boolean) => {
    setMessagePushEnabled(enabled)
    await configService.setMessagePushEnabled(enabled)
    showMessage(enabled ? '已开启主动推送' : '已关闭主动推送', true)
  }

  const getSessionFilterType = (session: { username: string; type?: ContactInfo['type'] | number }): SessionFilterType => {
    const username = String(session.username || '').trim()
    if (username.endsWith('@chatroom')) return 'group'
    if (username.startsWith('gh_') || session.type === 'official') return 'official'
    if (username.toLowerCase().includes('placeholder_foldgroup')) return 'other'
    if (session.type === 'former_friend' || session.type === 'other') return 'other'
    return 'private'
  }

  const getSessionFilterTypeLabel = (type: SessionFilterType) => {
    switch (type) {
      case 'private': return '私聊'
      case 'group': return '群聊'
      case 'official': return '订阅号/服务号'
      default: return '其他/非好友'
    }
  }

  const handleSetMessagePushFilterMode = async (mode: configService.MessagePushFilterMode) => {
    setMessagePushFilterMode(mode)
    setMessagePushFilterDropdownOpen(false)
    await configService.setMessagePushFilterMode(mode)
    showMessage(
      mode === 'all' ? '主动推送已设为接收所有会话' :
        mode === 'whitelist' ? '主动推送已设为仅推送白名单' : '主动推送已设为屏蔽黑名单',
      true
    )
  }

  const handleAddMessagePushFilterSession = async (username: string) => {
    if (messagePushFilterList.includes(username)) return
    const next = [...messagePushFilterList, username]
    setMessagePushFilterList(next)
    await configService.setMessagePushFilterList(next)
    showMessage('已添加到主动推送过滤列表', true)
  }

  const handleRemoveMessagePushFilterSession = async (username: string) => {
    const next = messagePushFilterList.filter(item => item !== username)
    setMessagePushFilterList(next)
    await configService.setMessagePushFilterList(next)
    showMessage('已从主动推送过滤列表移除', true)
  }

  const handleAddAllMessagePushFilterSessions = async () => {
    const usernames = messagePushAvailableSessions.map(session => session.username)
    if (usernames.length === 0) return
    const next = Array.from(new Set([...messagePushFilterList, ...usernames]))
    setMessagePushFilterList(next)
    await configService.setMessagePushFilterList(next)
    showMessage(`已添加 ${usernames.length} 个会话`, true)
  }

  const handleRemoveAllMessagePushFilterSessions = async () => {
    if (messagePushFilterList.length === 0) return
    setMessagePushFilterList([])
    await configService.setMessagePushFilterList([])
    showMessage('已清空主动推送过滤列表', true)
  }

  const { sessionFilterOptionMap, sessionFilterOptions } = useMemo(() => {
    const optionMap = new Map<string, SessionFilterOption>()

    for (const session of chatSessions) {
      if (session.username.toLowerCase().includes('placeholder_foldgroup')) continue
      optionMap.set(session.username, {
        username: session.username,
        displayName: getSessionDisplayName(session),
        avatarUrl: session.avatarUrl,
        type: getSessionFilterType(session)
      })
    }

    for (const contact of messagePushContactOptions) {
      if (!contact.username) continue
      if (contact.type !== 'friend' && contact.type !== 'group' && contact.type !== 'official' && contact.type !== 'former_friend') continue
      const existing = optionMap.get(contact.username)
      optionMap.set(contact.username, {
        username: contact.username,
        displayName: displayNameOrFallback(contact.username, existing?.displayName, contact.displayName, contact.remark, contact.nickname),
        avatarUrl: existing?.avatarUrl || contact.avatarUrl,
        type: getSessionFilterType(contact)
      })
    }

    const options = Array.from(optionMap.values())
      .sort((a, b) => {
        const aSession = chatSessions.find(session => session.username === a.username)
        const bSession = chatSessions.find(session => session.username === b.username)
        return Number(bSession?.sortTimestamp || bSession?.lastTimestamp || 0) -
          Number(aSession?.sortTimestamp || aSession?.lastTimestamp || 0)
      })

    return { sessionFilterOptionMap: optionMap, sessionFilterOptions: options }
  }, [chatSessions, messagePushContactOptions])

  const getSessionFilterOptionInfo = (username: string) => {
    return sessionFilterOptionMap.get(username) || {
      username,
      displayName: username,
      avatarUrl: undefined,
      type: 'other' as SessionFilterType
    }
  }

  const getAvailableSessionFilterOptions = (
    selectedList: string[],
    typeFilter: SessionFilterTypeValue,
    searchKeyword: string
  ) => {
    const keyword = searchKeyword.trim().toLowerCase()
    return sessionFilterOptions.filter(session => {
      if (selectedList.includes(session.username)) return false
      if (typeFilter !== 'all' && session.type !== typeFilter) return false
      if (keyword) {
        return String(session.displayName || '').toLowerCase().includes(keyword) ||
          session.username.toLowerCase().includes(keyword)
      }
      return true
    })
  }

  const notificationAvailableSessions = getAvailableSessionFilterOptions(
    notificationFilterList,
    notificationTypeFilter,
    filterSearchKeyword
  )

  const messagePushAvailableSessions = getAvailableSessionFilterOptions(
    messagePushFilterList,
    messagePushTypeFilter,
    messagePushFilterSearchKeyword
  )

  const handleAddAllNotificationFilterSessions = async () => {
    const usernames = notificationAvailableSessions.map(session => session.username)
    if (usernames.length === 0) return
    const next = Array.from(new Set([...notificationFilterList, ...usernames]))
    setNotificationFilterList(next)
    await configService.setNotificationFilterList(next)
    showMessage(`已添加 ${usernames.length} 个会话`, true)
  }

  const handleRemoveAllNotificationFilterSessions = async () => {
    if (notificationFilterList.length === 0) return
    setNotificationFilterList([])
    await configService.setNotificationFilterList([])
    showMessage('已清空通知过滤列表', true)
  }

  const handleSetNotificationFilterMode = async (mode: SessionFilterMode) => {
    setNotificationFilterMode(mode)
    setFilterModeDropdownOpen(false)
    await configService.setNotificationFilterMode(mode)
    showMessage(
      mode === 'all' ? '已设为接收所有通知' :
        mode === 'whitelist' ? '已设为仅接收白名单通知' : '已设为屏蔽黑名单通知',
      true
    )
  }

  const renderApiTab = () => (
    <div className="tab-content">
      <div className="form-group">
        <label>HTTP API 服务</label>
        <span className="form-hint">启用后可通过 HTTP 接口查询消息数据（仅限本机访问）</span>
        <div className="log-toggle-line">
          <span className="log-status">
            {httpApiRunning ? '运行中' : '已停止'}
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={httpApiRunning}
              onChange={handleToggleApi}
              disabled={isTogglingApi}
            />
            <span className="switch-slider" />
          </label>
        </div>
      </div>

      <div className="form-group">
        <label>监听地址</label>
        <span className="form-hint">
          API 服务绑定的主机地址。默认 <code>127.0.0.1</code> 仅本机访问；Docker/N8N 等容器场景请改为 <code>0.0.0.0</code> 以允许外部访问（注意配合 Token 鉴权）
        </span>
        <input
            type="text"
            className="field-input"
            value={httpApiHost}
            placeholder="127.0.0.1"
            onChange={(e) => {
              const host = e.target.value.trim() || '127.0.0.1'
              setHttpApiHost(host)
              scheduleConfigSave('httpApiHost', () => configService.setHttpApiHost(host))
            }}
            disabled={httpApiRunning}
            style={{ width: 180, fontFamily: 'monospace' }}
        />
      </div>

      <div className="form-group">
        <label>服务端口</label>
        <span className="form-hint">API 服务监听的端口号（1024-65535）</span>
        <input
            type="number"
            className="field-input"
            value={httpApiPort}
            onChange={(e) => {
              const port = parseInt(e.target.value, 10) || 5031
              setHttpApiPort(port)
              scheduleConfigSave('httpApiPort', () => configService.setHttpApiPort(port))
            }}
            disabled={httpApiRunning}
            style={{ width: 120 }}
            min={1024}
            max={65535}
        />
      </div>

      <div className="form-group">
        <label>Access Token (鉴权凭证)</label>
        <span className="form-hint">
          设置后，请求头需携带 <code>Authorization: Bearer &lt;token&gt;</code>，
          或者参数中携带 <code>?access_token=&lt;token&gt;</code>
        </span>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <input
              type="text"
              className="field-input"
              value={httpApiToken}
              placeholder="留空表示不验证 Token"
              onChange={(e) => {
                const val = e.target.value
                setHttpApiToken(val)
                scheduleConfigSave('httpApiToken', () => configService.setHttpApiToken(val))
              }}
              style={{ flex: 1, fontFamily: 'monospace' }}
          />
          <button className="btn btn-secondary" onClick={generateRandomToken}>
            <RefreshCw size={14} style={{ marginRight: 4 }} /> 随机生成
          </button>
          {httpApiToken && (
              <button className="btn btn-danger" onClick={clearApiToken} title="清除 Token">
                <Trash2 size={14} />
              </button>
          )}
        </div>
      </div>

      {httpApiRunning && (
        <div className="form-group">
          <label>API 地址</label>
          <span className="form-hint">使用以下地址访问 API</span>
          <div className="api-url-display">
            <input
              type="text"
              className="field-input"
              value={`http://${httpApiHost}:${httpApiPort}`}
              readOnly
            />
            <button className="btn btn-secondary" onClick={handleCopyApiUrl} title="复制">
              <Copy size={16} />
            </button>
          </div>
        </div>
      )}

      {/* API 安全警告弹窗 */}
      <div className="form-group">
        <label>默认媒体导出目录</label>
        <span className="form-hint">`/api/v1/messages` 在开启 `media=1` 时会把媒体保存到这里</span>
        <input
          type="text"
          className="field-input"
          value={httpApiMediaExportPath || '未获取到目录'}
          readOnly
        />
      </div>

      <div className="divider" />

      <div className="form-group">
        <label>主动推送</label>
        <span className="form-hint">检测到新收到的消息后，会通过当前 API 端口下的固定 SSE 地址主动推送给外部订阅端</span>
        <div className="log-toggle-line">
          <span className="log-status">
            {messagePushEnabled ? '已开启' : '已关闭'}
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={messagePushEnabled}
              onChange={(e) => { void handleToggleMessagePush(e.target.checked) }}
            />
            <span className="switch-slider" />
          </label>
        </div>
      </div>

      <div className="form-group">
        <label>推送会话过滤</label>
        <span className="form-hint">选择只推送特定会话，或屏蔽特定会话</span>
        <div className="custom-select">
          <div
            className={`custom-select-trigger ${messagePushFilterDropdownOpen ? 'open' : ''}`}
            onClick={() => setMessagePushFilterDropdownOpen(!messagePushFilterDropdownOpen)}
          >
            <span className="custom-select-value">
              {messagePushFilterMode === 'all' ? '推送所有会话' :
                messagePushFilterMode === 'whitelist' ? '仅推送白名单' : '屏蔽黑名单'}
            </span>
            <ChevronDown size={14} className={`custom-select-arrow ${messagePushFilterDropdownOpen ? 'rotate' : ''}`} />
          </div>
          <div className={`custom-select-dropdown ${messagePushFilterDropdownOpen ? 'open' : ''}`}>
            {[
              { value: 'all', label: '推送所有会话' },
              { value: 'whitelist', label: '仅推送白名单' },
              { value: 'blacklist', label: '屏蔽黑名单' }
            ].map(option => (
              <div
                key={option.value}
                className={`custom-select-option ${messagePushFilterMode === option.value ? 'selected' : ''}`}
                onClick={() => { void handleSetMessagePushFilterMode(option.value as configService.MessagePushFilterMode) }}
              >
                {option.label}
                {messagePushFilterMode === option.value && <Check size={14} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {messagePushFilterMode !== 'all' && (
        <div className="form-group">
          <label>{messagePushFilterMode === 'whitelist' ? '主动推送白名单' : '主动推送黑名单'}</label>
          <span className="form-hint">
            {messagePushFilterMode === 'whitelist'
              ? '点击左侧会话添加到白名单，只有白名单会话会推送'
              : '点击左侧会话添加到黑名单，黑名单会话不会推送'}
          </span>
          <div className="push-filter-type-tabs">
            {sessionFilterTypeOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={`push-filter-type-tab ${messagePushTypeFilter === option.value ? 'active' : ''}`}
                onClick={() => setMessagePushTypeFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="notification-filter-container">
            <div className="filter-panel">
              <div className="filter-panel-header">
                <span>可选会话</span>
                {messagePushAvailableSessions.length > 0 && (
                  <button
                    type="button"
                    className="filter-panel-action"
                    onClick={() => { void handleAddAllMessagePushFilterSessions() }}
                  >
                    全选当前
                  </button>
                )}
                <div className="filter-search-box">
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="搜索会话..."
                    value={messagePushFilterSearchKeyword}
                    onChange={(e) => setMessagePushFilterSearchKeyword(e.target.value)}
                  />
                </div>
              </div>
              <div className="filter-panel-list">
                {messagePushAvailableSessions.length > 0 ? (
                  messagePushAvailableSessions.map(session => {
                    const displayName = getSessionDisplayName(session)
                    return (
                      <div
                        key={session.username}
                        className="filter-panel-item"
                        onClick={() => { void handleAddMessagePushFilterSession(session.username) }}
                      >
                        <Avatar
                          src={session.avatarUrl}
                          name={displayName}
                          size={28}
                        />
                        <span className="filter-item-name">{displayName}</span>
                        <span className="filter-item-type">{getSessionFilterTypeLabel(session.type)}</span>
                        <span className="filter-item-action">+</span>
                      </div>
                    )
                  })
                ) : (
                  <div className="filter-panel-empty">
                    {messagePushFilterSearchKeyword || messagePushTypeFilter !== 'all' ? '没有匹配的会话' : '暂无可添加的会话'}
                  </div>
                )}
              </div>
            </div>

            <div className="filter-panel">
              <div className="filter-panel-header">
                <span>{messagePushFilterMode === 'whitelist' ? '白名单' : '黑名单'}</span>
                {messagePushFilterList.length > 0 && (
                  <span className="filter-panel-count">{messagePushFilterList.length}</span>
                )}
                {messagePushFilterList.length > 0 && (
                  <button
                    type="button"
                    className="filter-panel-action"
                    onClick={() => { void handleRemoveAllMessagePushFilterSessions() }}
                  >
                    全不选
                  </button>
                )}
              </div>
              <div className="filter-panel-list">
                {messagePushFilterList.length > 0 ? (
                  messagePushFilterList.map(username => {
                    const session = getSessionFilterOptionInfo(username)
                    const displayName = displayNameOrFallback(username, session.displayName)
                    return (
                      <div
                        key={username}
                        className="filter-panel-item selected"
                        onClick={() => { void handleRemoveMessagePushFilterSession(username) }}
                      >
                        <Avatar
                          src={session.avatarUrl}
                          name={displayName}
                          size={28}
                        />
                        <span className="filter-item-name">{displayName}</span>
                        <span className="filter-item-type">{getSessionFilterTypeLabel(session.type)}</span>
                        <span className="filter-item-action">×</span>
                      </div>
                    )
                  })
                ) : (
                  <div className="filter-panel-empty">尚未添加任何会话</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="form-group">
        <label>推送地址</label>
        <span className="form-hint">外部软件连接这个 SSE 地址即可接收新消息推送；需要先开启上方 `HTTP API 服务`</span>
        <div className="api-url-display">
          <input
              type="text"
              className="field-input"
              value={`http://${httpApiHost}:${httpApiPort}/api/v1/push/messages${httpApiToken ? `?access_token=${httpApiToken}` : ''}`}
              readOnly
          />
          <button
              className="btn btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(`http://${httpApiHost}:${httpApiPort}/api/v1/push/messages${httpApiToken ? `?access_token=${httpApiToken}` : ''}`)
                showMessage('已复制推送地址', true)
              }}
              title="复制"
          >
            <Copy size={16} />
          </button>
        </div>
      </div>

      <div className="form-group">
        <label>推送内容</label>
        <span className="form-hint">SSE 事件名包含 `message.new` 和 `message.revoke`；私聊推送 `rawid/avatarUrl/sourceName/content/timestamp`，群聊额外附带 `groupName`，其中 `timestamp` 为秒级 Unix 时间戳</span>
        <div className="api-docs">
          <div className="api-item">
            <div className="api-endpoint">
              <span className="method get">GET</span>
              <code>{`http://${httpApiHost}:${httpApiPort}/api/v1/push/messages`}</code>
            </div>
            <p className="api-desc">通过 SSE 长连接接收消息事件，建议接收端按 `event + rawid` 去重。</p>
            <div className="api-params">
              {['event', 'sessionId', 'sessionType', 'rawid', 'avatarUrl', 'sourceName', 'groupName?', 'content', 'timestamp'].map((param) => (
                <span key={param} className="param">
                  <code>{param}</code>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showApiWarning && (
        <div className="modal-overlay" onClick={() => setShowApiWarning(false)}>
          <div className="api-warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <ShieldCheck size={20} />
              <h3>安全提示</h3>
            </div>
            <div className="modal-body">
              <p className="warning-text">启用 HTTP API 服务后，本机上的其他程序可通过接口访问您的聊天记录数据。</p>
              <div className="warning-list">
                <div className="warning-item">
                  <span className="bullet">•</span>
                  <span>请确保您了解此功能的用途</span>
                </div>
                <div className="warning-item">
                  <span className="bullet">•</span>
                  <span>不要在公共或不信任的网络环境下使用</span>
                </div>
                <div className="warning-item">
                  <span className="bullet">•</span>
                  <span>此功能仅供高级用户或开发者使用</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowApiWarning(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={confirmStartApi}>
                确认启动
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const handleSetupHello = async () => {
    if (!helloPassword) {
      showMessage('请输入当前密码以开启 Hello', false)
      return
    }
    if (!isWindows) {
      showMessage('当前系统不支持 Windows Hello', false)
      return
    }
    setIsSettingHello(true)
    try {
      const verifyResult = await window.electronAPI.auth.hello('请验证您的身份以开启 Windows Hello')
      if (!verifyResult.success) {
        showMessage(verifyResult.error || 'Windows Hello 验证失败', false)
        return
      }

      const saveResult = await window.electronAPI.auth.setHelloSecret(helloPassword)
      if (!saveResult.success) {
        showMessage('Windows Hello 配置保存失败', false)
        return
      }

      setAuthUseHello(true)
      setHelloPassword('')
      showMessage('Windows Hello 设置成功', true)
    } catch (e: any) {
      showMessage(`Windows Hello 设置失败: ${e?.message || String(e)}`, false)
    } finally {
      setIsSettingHello(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      showMessage('两次密码不一致', false)
      return
    }

    try {
      const lockMode = await window.electronAPI.auth.isLockMode()

      if (authEnabled && lockMode) {
        // 已开启应用锁且已是 lock: 模式 → 修改密码
        if (!oldPassword) {
          showMessage('请输入旧密码', false)
          return
        }
        const result = await window.electronAPI.auth.changePassword(oldPassword, newPassword)
        if (result.success) {
          setNewPassword('')
          setConfirmPassword('')
          setOldPassword('')
          showMessage('密码已更新', true)
        } else {
          showMessage(result.error || '密码更新失败', false)
        }
      } else {
        // 未开启应用锁，或旧版 safe: 模式 → 开启/升级为 lock: 模式
        const result = await window.electronAPI.auth.enableLock(newPassword)
        if (result.success) {
          setAuthEnabled(true)
          setIsLockMode(true)
          setNewPassword('')
          setConfirmPassword('')
          setOldPassword('')
          showMessage('应用锁已开启', true)
        } else {
          showMessage(result.error || '开启失败', false)
        }
      }
    } catch (e: any) {
      showMessage('操作失败', false)
    }
  }

  const renderAnalyticsTab = () => (
    <div className="tab-content">
      <div className="settings-section">
        <h2>分析设置</h2>
        <div className="setting-item">
          <div className="setting-label">
            <span>词云排除词</span>
            <span className="setting-desc">输入不需要在词云和常用语中显示的词语，用换行分隔</span>
          </div>
          <div className="setting-control" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
            <textarea
              className="form-input"
              style={{ width: '100%', height: '200px', fontFamily: 'monospace' }}
              value={excludeWordsInput}
              onChange={(e) => setExcludeWordsInput(e.target.value)}
              placeholder="例如：
第一个词
第二个词
第三个词"
            />
            <div className="button-group">
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const words = excludeWordsInput.split('\n').map(w => w.trim()).filter(w => w.length > 0)
                  // 去重
                  const uniqueWords = Array.from(new Set(words))
                  await configService.setWordCloudExcludeWords(uniqueWords)
                  setWordCloudExcludeWords(uniqueWords)
                  setExcludeWordsInput(uniqueWords.join('\n'))
                  // Show success toast or feedback if needed (optional)
                }}
              >
                保存排除列表
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setExcludeWordsInput(wordCloudExcludeWords.join('\n'))
                }}
              >
                重置
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  )

  const renderSecurityTab = () => (
    <div className="tab-content">
      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <label>应用锁状态</label>
            <span className="form-hint">{
              isLockMode ? '已开启' :
                authEnabled ? '旧版模式 — 请重新设置密码以升级为新模式提高安全性' :
                  '未开启 — 请设置密码以开启'
            }</span>
          </div>
          {authEnabled && !showDisableLockInput && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowDisableLockInput(true)}
            >
              关闭应用锁
            </button>
          )}
        </div>
        {showDisableLockInput && (
          <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
            <input
              type="password"
              className="field-input"
              placeholder="输入当前密码以关闭"
              value={disableLockPassword}
              onChange={e => setDisableLockPassword(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!disableLockPassword}
              onClick={async () => {
                const result = await window.electronAPI.auth.disableLock(disableLockPassword)
                if (result.success) {
                  setAuthEnabled(false)
                  setAuthUseHello(false)
                  setIsLockMode(false)
                  setShowDisableLockInput(false)
                  setDisableLockPassword('')
                  showMessage('应用锁已关闭', true)
                } else {
                  showMessage(result.error || '关闭失败', false)
                }
              }}
            >确认</button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setShowDisableLockInput(false); setDisableLockPassword('') }}
            >取消</button>
          </div>
        )}
      </div>

      <div className="divider" />

      <div className="form-group">
        <label>{isLockMode ? '修改密码' : '设置密码并开启应用锁'}</label>
        <span className="form-hint">{isLockMode ? '修改应用锁密码（需要旧密码验证）' : '设置密码后将自动开启应用锁'}</span>

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isLockMode && (
            <input
              type="password"
              className="field-input"
              placeholder="旧密码"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
            />
          )}
          <input
            type="password"
            className="field-input"
            placeholder="新密码"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="password"
              className="field-input"
              placeholder="确认新密码"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={handleUpdatePassword} disabled={!newPassword}>
              {isLockMode ? '更新' : '开启'}
            </button>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div className="form-group">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <label>Windows Hello</label>
            <span className="form-hint">使用面容、指纹快速解锁</span>
            {!authEnabled && <div className="form-hint warning" style={{ color: '#ff4d4f' }}>请先开启应用锁</div>}
            {!helloAvailable && authEnabled && <div className="form-hint warning" style={{ color: '#ff4d4f' }}>当前设备不支持 Windows Hello</div>}
          </div>

          <div>
            {authUseHello ? (
              <button className="btn btn-secondary btn-sm" onClick={async () => {
                await window.electronAPI.auth.clearHelloSecret()
                setAuthUseHello(false)
                showMessage('Windows Hello 已关闭', true)
              }}>关闭</button>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleSetupHello}
                disabled={!helloAvailable || isSettingHello || !authEnabled || !helloPassword}
              >
                {isSettingHello ? '配置中...' : '开启与设置'}
              </button>
            )}
          </div>
        </div>
        {!authUseHello && authEnabled && (
          <div style={{ marginTop: 10 }}>
            <input
              type="password"
              className="field-input"
              placeholder="输入当前密码以开启 Hello"
              value={helloPassword}
              onChange={e => setHelloPassword(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  )

  const renderAboutTab = () => (
    <div className="tab-content about-tab">
      <div className="about-card">
        <div className="about-logo">
          <img src="./logo.png" alt="WeFlow" />
        </div>
        <h2 className="about-name">WeFlow</h2>
        <p className="about-version">v{appVersion || '...'}</p>
      </div>

      <div className="about-footer">
        <p className="about-desc">聊天记录分析工具</p>
        <div className="about-links">
          <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI.shell.openExternal('https://weflow.top') }}>官网</a>
          <span>·</span>
          <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI.shell.openExternal('https://github.com/hicccc77/WeFlow') }}>GitHub 仓库</a>
          <span>·</span>
          <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI.shell.openExternal('https://chatlab.fun') }}>ChatLab</a>
          <span>·</span>
          <a href="#" onClick={(e) => { e.preventDefault(); window.electronAPI.window.openAgreementWindow() }}>用户协议</a>
        </div>
        <p className="copyright">© 2026 WeFlow. All rights reserved.</p>

        <div className="log-toggle-line" style={{ marginTop: '16px', justifyContent: 'center' }}>
          <span style={{ fontSize: '13px', opacity: 0.7 }}>匿名数据收集</span>
          <label className="switch">
            <input
              type="checkbox"
              className="switch-input"
              checked={analyticsConsent}
              onChange={async (e) => {
                const consent = e.target.checked
                setAnalyticsConsent(consent)
                await configService.setAnalyticsConsent(consent)
                showMessage(consent ? '已允许数据收集' : '已拒绝数据收集', true)
              }}
            />
            <span className="switch-slider"></span>
          </label>
        </div>
      </div>

    </div>
  )

  const renderAutoDownloadTab = () => {
    const sortedSessions = [...antiRevokeSessions].sort((a, b) => (b.sortTimestamp || 0) - (a.sortTimestamp || 0))
    const keyword = autoDownloadSearchKeyword.trim().toLowerCase()
    const filteredSessions = sortedSessions.filter((session) => {
      if (!keyword) return true
      const displayName = String(session.displayName || '').toLowerCase()
      const username = String(session.username || '').toLowerCase()
      return displayName.includes(keyword) || username.includes(keyword)
    })
    const filteredSessionIds = filteredSessions.map((session) => session.username)
    const selectedCount = autoDownloadSelectedIds.size
    const selectedInFilteredCount = filteredSessionIds.filter((id) => autoDownloadSelectedIds.has(id)).length
    const allFilteredSelected = filteredSessionIds.length > 0 && selectedInFilteredCount === filteredSessionIds.length
    const isHooked = autoDownloadStatus?.isHooked

    const persistWhitelist = (ids: Set<string>) => {
      const whitelistArr = Array.from(ids)
      configService.setAutoDownloadWhitelist(whitelistArr)
      if (autoDownloadHighRes) {
        const whitelistStr = whitelistArr.length > 0 ? (whitelistArr.join('\0') + '\0\0') : '';
        (window as any).electronAPI.image.startAutoDownload(whitelistStr)
      }
    }

    const toggleSelection = (id: string) => {
      const next = new Set(autoDownloadSelectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setAutoDownloadSelectedIds(next)
      persistWhitelist(next)
    }

    const selectAllFiltered = () => {
      const next = new Set(autoDownloadSelectedIds)
      filteredSessionIds.forEach(id => next.add(id))
      setAutoDownloadSelectedIds(next)
      persistWhitelist(next)
    }

    const clearSelection = () => {
      const next = new Set<string>()
      setAutoDownloadSelectedIds(next)
      persistWhitelist(next)
    }

    return (
        <div className="tab-content anti-revoke-tab">
          {/* 顶部 Hero 区域保持不变 */}
          <div className="anti-revoke-hero" style={{ background: 'linear-gradient(110deg, var(--bg-primary) 0%, rgba(245, 158, 11, 0.1) 100%)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
            <div className="anti-revoke-hero-main">
              <span className="updates-chip" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', width: 'fit-content' }}>测试功能 (Test)</span>
              <h2 style={{ marginTop: '8px' }}>自动下载原图</h2>
              <p>强制目标应用在接收图片时下载高清原图。建议仅在必要会话中开启以节省流量和空间。依赖第三方组件，需在下方配置路径和目标进程名。</p>
            </div>
            <div className="anti-revoke-metrics">
              <div className={`anti-revoke-metric ${isHooked ? 'is-installed' : 'is-pending'}`}>
                <span className="label">服务状态</span>
                <span className="value" style={{ fontSize: '14px' }}>
              {isHooked ? '正在监控' : autoDownloadHighRes ? '等待连接' : '未启用'}
            </span>
              </div>
              <div className="anti-revoke-metric">
                <span className="label">已选会话</span>
                <span className="value">{selectedCount}</span>
              </div>
            </div>
          </div>

          <div className="anti-revoke-control-card">
            <div className="form-group">
              <label>第三方原图下载组件路径</label>
              <input
                type="text"
                placeholder="未配置"
                value={imgHelperLibPath}
                onChange={(e) => {
                  const value = e.target.value
                  setImgHelperLibPath(value)
                  scheduleConfigSave('imgHelperLibPath', () => configService.setImgHelperLibPath(value))
                }}
              />
              <button className="btn btn-secondary btn-sm" onClick={handleSelectImgHelperLibPath}><FolderOpen size={14} /> 浏览选择</button>
            </div>
            <div className="form-group">
              <label>目标进程名</label>
              <span className="form-hint">例如: App.exe</span>
              <input
                type="text"
                placeholder="未配置"
                value={imgHelperProcessName}
                onChange={(e) => {
                  const value = e.target.value
                  setImgHelperProcessName(value)
                  scheduleConfigSave('imgHelperProcessName', () => configService.setImgHelperProcessName(value))
                }}
              />
            </div>
          </div>

          <div className="anti-revoke-control-card">
            <div className="anti-revoke-toolbar">
              <div className="filter-search-box anti-revoke-search">
                <Search size={14} />
                <input
                    type="text"
                    placeholder="搜索联系人或群聊..."
                    value={autoDownloadSearchKeyword}
                    onChange={(e) => setAutoDownloadSearchKeyword(e.target.value)}
                />
              </div>
              <div className="anti-revoke-toolbar-actions">
                <div className="anti-revoke-btn-group">
                  <button className="btn btn-secondary btn-sm" onClick={selectAllFiltered} disabled={filteredSessionIds.length === 0 || allFilteredSelected}>
                    全选
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={clearSelection} disabled={selectedCount === 0}>
                    清空选择
                  </button>
                </div>
                <div className="anti-revoke-btn-group" style={{ marginLeft: '12px', paddingLeft: '12px', borderLeft: '1px solid var(--border-color)' }}>
                  <label className="switch switch-md">
                    <input
                        type="checkbox"
                        checked={autoDownloadHighRes}
                        onChange={() => handleToggleAutoDownload(Array.from(autoDownloadSelectedIds))}
                    />
                    <span className="switch-slider" />
                  </label>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                {autoDownloadHighRes ? '服务已开启' : '服务已关闭'}
              </span>
                </div>
              </div>
            </div>

            <div className="anti-revoke-batch-actions">
              <div className="anti-revoke-selected-count">
                <span>已选 <strong>{selectedCount}</strong> 个目标会话</span>
                <span style={{ opacity: 0.6 }}>（若不选则默认对所有聊天生效）</span>
              </div>
            </div>
          </div>

          <div className="anti-revoke-list">
            <div className="anti-revoke-list-header">
              <span>会话（{filteredSessions.length}）</span>
              <span>状态</span>
            </div>
            {filteredSessions.length === 0 ? (
                <div className="anti-revoke-empty">{autoDownloadSearchKeyword ? '没有匹配的会话' : '暂无会话'}</div>
            ) : (
                filteredSessions.map((session) => {
                  const isSelected = autoDownloadSelectedIds.has(session.username)
                  return (
                      <div key={session.username} className={`anti-revoke-row ${isSelected ? 'selected' : ''}`}>
                        <label className="anti-revoke-row-main">
                  <span className="anti-revoke-check">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(session.username)}
                    />
                    <span className="check-indicator" aria-hidden="true">
                      <Check size={12} />
                    </span>
                  </span>
                          <Avatar src={session.avatarUrl} name={getSessionDisplayName(session)} size={30} />
                          <div className="anti-revoke-row-text">
                            <span className="name">{getSessionDisplayName(session)}</span>
                          </div>
                        </label>
                        <div className="anti-revoke-row-status">
                  <span className={`status-badge ${isSelected ? 'installed' : 'not-installed'}`}>
                    <i className="status-dot" aria-hidden="true" />
                    {isSelected ? '已监控' : '未开启'}
                  </span>
                        </div>
                      </div>
                  )
                })
            )}
          </div>

          {/* 风险提示部分保持不变 */}
          <div className="api-warning-modal" style={{ width: '100%', border: '1px solid rgba(239, 68, 68, 0.2)', marginTop: '16px', background: 'rgba(239, 68, 68, 0.02)', animation: 'none', boxShadow: 'none', position: 'static' }}>
            <div className="modal-header" style={{ border: 'none', padding: '12px 20px 0' }}>
              <Lock size={16} color="#ef4444" />
              <h3 style={{ fontSize: '13px', color: '#ef4444' }}>风险警告</h3>
            </div>
            <div className="modal-body" style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '8px 20px 12px' }}>
              此功能通过内存 Hook 修改目标应用行为，具有一定的风险。请尽量仅在白名单模式下针对必要会话开启。
            </div>
          </div>
        </div>
    )
  }


  const handleToggleAutoDownload = async (whitelist?: string[] | string) => {
    const newVal = !autoDownloadHighRes
    setAutoDownloadHighRes(newVal)

    try {
      if (newVal) {
        let currentWhitelist: string[] | string = whitelist || Array.from(autoDownloadSelectedIds)
        if (Array.isArray(currentWhitelist)) {
          currentWhitelist = currentWhitelist.length > 0 ? (currentWhitelist.join('\0') + '\0\0') : ''
        }
        const result = await (window as any).electronAPI.image.startAutoDownload(currentWhitelist)
        if (result && !result.success) {
          // 如果底层明确返回了失败
          throw new Error(result.error || '启动自动下载服务失败')
        }
        showMessage('自动下载已开启，正在尝试连接目标应用', true)
        await fetchAutoDownloadStatus()
      } else {
        await (window as any).electronAPI.image.stopAutoDownload()
        showMessage('自动下载已关闭', true)
        setAutoDownloadStatus(null)
      }
      await configService.setAutoDownloadHighRes(newVal)
    } catch (e: any) {
      // 发生错误时，将开关拨回去
      setAutoDownloadHighRes(!newVal)
      showMessage(`操作失败: ${e.message || String(e)}`, false)
    }
  }

  const renderUpdatesTab = () => {
    const downloadPercent = Math.max(0, Math.min(100, Number(downloadProgress?.percent || 0)))
    const channelCards: { id: configService.UpdateChannel; title: string; desc: string }[] = [
      { id: 'stable', title: '稳定版', desc: '正式发布的版本，适合日常使用' },
      { id: 'preview', title: '预览版', desc: '正式发布前的预览体验版本' },
      { id: 'dev', title: '开发版', desc: '即刻体验我们的屎山代码' }
    ]

    return (
      <div className="tab-content updates-tab">
        <div className="updates-hero">
          <div className="updates-hero-main">
            <span className="updates-chip">当前版本</span>
            <h2>{appVersion || '...'}</h2>
            <p>{updateInfo?.hasUpdate ? `发现新版本 v${updateInfo.version}` : '当前已是最新版本，可手动检查更新'}</p>
          </div>
          <div className="updates-hero-action">
            {updateInfo?.hasUpdate ? (
              <button className="btn btn-primary" onClick={() => setShowUpdateDialog(true)}>
                <Download size={16} /> 立即更新
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={handleCheckUpdate} disabled={isCheckingUpdate}>
                <RefreshCw size={16} className={isCheckingUpdate ? 'spin' : ''} />
                {isCheckingUpdate ? '检查中...' : '检查更新'}
              </button>
            )}
          </div>
        </div>

        {(isDownloading || updateInfo?.hasUpdate) && (
          <div className="updates-progress-card">
            <div className="updates-progress-header">
              <h3>{isDownloading ? `正在下载 v${updateInfo?.version || ''}` : `新版本 v${updateInfo?.version} 已就绪`}</h3>
              {isDownloading ? <strong>{downloadPercent.toFixed(0)}%</strong> : <span>可立即安装</span>}
            </div>
            <div className="updates-progress-track">
              <div className="updates-progress-fill" style={{ width: `${isDownloading ? downloadPercent : 100}%` }} />
            </div>
            {updateInfo?.hasUpdate && !isDownloading && (
              <button className="btn btn-secondary updates-ignore-btn" onClick={handleIgnoreUpdate}>
                暂不提醒此版本
              </button>
            )}
          </div>
        )}

        <div className="updates-card">
          <div className="updates-card-header">
            <h3>更新渠道</h3>
            <span>切换渠道后会自动重新检查</span>
          </div>
          <div className="update-channel-grid">
            {channelCards.map((channel) => {
              const active = updateChannel === channel.id
              return (
                <button
                  key={channel.id}
                  className={`update-channel-card ${active ? 'active' : ''}`}
                  onClick={() => void handleUpdateChannelChange(channel.id)}
                  disabled={active}
                >
                  <div className="update-channel-title-row">
                    <span className="title">{channel.title}</span>
                    {active && <Check size={16} />}
                  </div>
                  <span className="desc">{channel.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className={`settings-modal-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className={`settings-page ${isClosing ? 'closing' : ''}`} onClick={(event) => event.stopPropagation()}>
        {message && (
          <div
            className={`message-toast ${message.success ? 'success' : 'error'}`}
            role={message.success ? 'status' : 'alert'}
            aria-live={message.success ? 'polite' : 'assertive'}
            aria-atomic="true"
          >
            <span>{message.text}</span>
            {!message.success && (
              <ErrorReferenceLink error={message.text} label="核对" compact inverse />
            )}
          </div>
        )}


        <div className="settings-header">
          <div className="settings-title-block">
            <h1>设置</h1>
          </div>
          <div className="settings-actions">
            {onClose && (
              <button type="button" className="settings-close-btn" onClick={handleClose} aria-label="关闭设置">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="settings-layout">
          <div className="settings-tabs" role="tablist" aria-label="设置项">
            {filteredTabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon size={16} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="settings-body">
            {activeTab === 'appearance' && renderAppearanceTab()}
            {activeTab === 'notification' && renderNotificationTab()}
            {activeTab === 'antiRevoke' && renderAntiRevokeTab()}
            {activeTab === 'database' && renderDatabaseTab()}
            {activeTab === 'models' && renderModelsTab()}
            {activeTab === 'cache' && renderCacheTab()}
            {activeTab === 'api' && renderApiTab()}
            {activeTab === 'autoDownload' && renderAutoDownloadTab()}
            {activeTab === 'updates' && renderUpdatesTab()}
            {activeTab === 'analytics' && renderAnalyticsTab()}
            {activeTab === 'security' && renderSecurityTab()}
            {activeTab === 'about' && renderAboutTab()}
          </div>
        </div>
      </div>
    </div>

    </>
  )
}

export default SettingsPage














