// src/App.tsx
import { useState, useEffect, useCallback } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  FolderIcon,
  Trash2Icon,
  ScanIcon,
  FolderOpenIcon,
  Loader2,
} from 'lucide-react'
import { cn } from './lib/utils'

import './App.css'

interface FolderWithNodeModules {
  path: string
  name: string
  size: string
  selected: boolean
}

function App() {
  const [baseDir, setBaseDir] = useState('')
  const [scanning, setScanning] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [folders, setFolders] = useState<FolderWithNodeModules[]>([])
  const [totalSize, setTotalSize] = useState('0 MB')
  const [selectedSize, setSelectedSize] = useState('0 MB')
  const [calculateSize, setCalculateSize] = useState(false)

  const calculateSelectedSize = useCallback(() => {
    const selectedFolders = folders.filter((folder) => folder.selected)
    if (selectedFolders.length === 0) {
      setSelectedSize('0 MB')
      return
    }

    let totalBytes = 0
    selectedFolders.forEach((folder) => {
      const sizeMatch = folder.size.match(/^([\d.]+) (MB|GB)$/)
      if (sizeMatch) {
        const value = parseFloat(sizeMatch[1])
        const unit = sizeMatch[2]
        if (unit === 'MB') {
          totalBytes += value * 1024 * 1024
        } else if (unit === 'GB') {
          totalBytes += value * 1024 * 1024 * 1024
        }
      }
    })

    if (totalBytes > 1024 * 1024 * 1024) {
      setSelectedSize(`${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`)
    } else {
      setSelectedSize(`${(totalBytes / (1024 * 1024)).toFixed(2)} MB`)
    }
  }, [folders])

  useEffect(() => {
    // 计算选中的文件夹总大小
    calculateSelectedSize()
  }, [calculateSelectedSize, folders])

  const selectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择要扫描的目录',
      })

      if (selected && typeof selected === 'string') {
        setBaseDir(selected)
        setFolders([])
      }
    } catch (error) {
      console.error('选择目录出错:', error)
    }
  }

  const scanNodeModules = async () => {
    if (!baseDir) return

    setScanning(true)
    setFolders([])
    try {
      const result = await invoke<{
        folders: FolderWithNodeModules[]
        total_size: string
      }>('scan_node_modules', { baseDir, calculateSize })

      console.log('🚀 ~ scanNodeModules ~ result:', result)

      setFolders(
        result.folders.map((folder) => ({ ...folder, selected: true })),
      )
      setTotalSize(result.total_size)
    } catch (error) {
      console.error('扫描 node_modules 出错:', error)
    } finally {
      setScanning(false)
    }
  }

  const cleanNodeModules = async () => {
    const selectedPaths = folders
      .filter((folder) => folder.selected)
      .map((folder) => folder.path)

    if (selectedPaths.length === 0) return

    setCleaning(true)
    try {
      await invoke('clean_node_modules', { paths: selectedPaths })
      // 清理完成后重新扫描
      await scanNodeModules()
    } catch (error) {
      console.error('清理 node_modules 出错:', error)
    } finally {
      setCleaning(false)
    }
  }

  const toggleSelectFolder = (index: number) => {
    setFolders(
      folders.map((folder, i) =>
        i === index ? { ...folder, selected: !folder.selected } : folder,
      ),
    )
  }

  const toggleSelectAll = () => {
    const allSelected = folders.every((folder) => folder.selected)
    setFolders((prev) =>
      prev.map((folder) => ({ ...folder, selected: !allSelected })),
    )
  }

  // 计算已选择的百分比
  const getSelectedPercentage = () => {
    if (folders.length === 0) return 0
    const selectedCount = folders.filter((folder) => folder.selected).length
    return (selectedCount / folders.length) * 100
  }

  return (
    <div
      className={cn('container p-4 mx-auto max-w-4xl mt-30', {
        'mt-0': folders.length > 0,
      })}
    >
      <Card className="border-none shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl font-bold text-center">
            Black Hole Cleaner
          </CardTitle>
          <CardDescription className="text-center">
            扫描并清理 node_modules 文件夹，释放磁盘空间
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* 选择目录 */}
          <div className="flex items-center gap-2">
            <Button
              onClick={selectDirectory}
              disabled={scanning || cleaning}
              className="gap-2"
            >
              <FolderOpenIcon size={16} />
              选择目录
            </Button>
            <div className="px-3 py-2 overflow-hidden text-sm bg-muted rounded-md flex-1 truncate">
              {baseDir || '...'}
            </div>
          </div>

          {/* 扫描 node_modules */}
          {baseDir && (
            <div className="flex justify-center gap-4 items-center">
              <Button
                onClick={scanNodeModules}
                disabled={scanning || cleaning}
                variant="secondary"
                className="gap-2"
              >
                {scanning ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <ScanIcon size={16} />
                )}
                {scanning ? '扫描中...' : '扫描 node_modules'}
              </Button>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="calculateSize"
                  checked={calculateSize}
                  onCheckedChange={(checked) =>
                    setCalculateSize(checked as boolean)
                  }
                />
                <label
                  htmlFor="calculateSize"
                  className="text-sm font-medium leading-none"
                >
                  计算文件大小（较耗时）
                </label>
              </div>
            </div>
          )}

          {/* 文件夹列表 */}
          {folders.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="px-2 py-1">
                    {folders.length} 个文件夹
                  </Badge>
                  {calculateSize && (
                    <Badge variant="outline" className="px-2 py-1">
                      总大小: {totalSize}
                    </Badge>
                  )}
                </div>
                {calculateSize && (
                  <Badge variant="default" className="px-2 py-1">
                    已选择: {selectedSize}
                  </Badge>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="selectAll"
                  checked={folders.every((folder) => folder.selected)}
                  onCheckedChange={toggleSelectAll}
                />
                <label
                  htmlFor="selectAll"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  全选
                </label>
                <div className="flex-1 ml-4">
                  <Progress value={getSelectedPercentage()} className="h-2" />
                </div>
              </div>

              <div className="border rounded-md divide-y">
                {folders.map((folder, index) => (
                  <div
                    key={folder.path}
                    className="flex items-center py-3 px-4 hover:bg-muted/50"
                  >
                    <div className="flex items-center flex-1 min-w-0">
                      <Checkbox
                        id={`folder-${index}`}
                        checked={folder.selected}
                        onCheckedChange={() => toggleSelectFolder(index)}
                        className="mr-3"
                      />
                      <FolderIcon
                        size={16}
                        className="mr-2 text-muted-foreground"
                      />
                      <span className="truncate text-sm" title={folder.path}>
                        {folder.path}
                      </span>
                    </div>
                    {calculateSize && (
                      <Badge variant="outline" className="ml-2">
                        {folder.size}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>

        {folders.length > 0 && (
          <CardFooter className="flex justify-center pb-6 pt-0">
            <Button
              onClick={cleanNodeModules}
              disabled={
                cleaning ||
                scanning ||
                folders.filter((f) => f.selected).length === 0
              }
              variant="destructive"
              className="gap-2"
            >
              <Trash2Icon size={16} />
              {cleaning ? '清理中...' : '清理选中的 node_modules'}
            </Button>
          </CardFooter>
        )}
      </Card>

      <div className="layer pointer-events-none"></div>
    </div>
  )
}

export default App
