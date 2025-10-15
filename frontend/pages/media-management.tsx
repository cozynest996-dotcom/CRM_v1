import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { Layout, Menu, Breadcrumb, Button, Upload, message, Card, Image, Row, Col, Typography, Input, Space, Popconfirm, Modal, Select, Segmented, List, Avatar, Spin } from 'antd';
import { UploadOutlined, FolderOutlined, DeleteOutlined, ExclamationCircleOutlined, EditOutlined, FilePdfOutlined, FileWordOutlined, FileExcelOutlined, FileTextOutlined, PlayCircleOutlined, FileOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Media, uploadMedia, getMediaList, deleteMedia, createFolder, deleteFolder, renameFolder, renameMedia } from '../services/media';
import { useAuth } from '../hooks/useAuth';
import Sidebar from '../components/Sidebar'; // 导入 Sidebar 组件
import { useRouter } from 'next/router'; // 导入 useRouter

const { Header, Content, Footer } = Layout; // 移除 Sider
const { Title } = Typography;
const { Search } = Input;
const { Option } = Select; // 解构 Option

interface MediaManagementFolder {
    name: string;
    count: number;
}

const MediaManagement: React.FC = () => {
    const [mediaList, setMediaList] = useState<Media[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [currentFolder, setCurrentFolder] = useState<string | undefined>(undefined);
    const [folders, setFolders] = useState<MediaManagementFolder[]>([]); // 使用新的接口名称
    const [newFolderName, setNewFolderName] = useState<string>(''); // 用于新文件夹名称的 state
    const [isModalVisible, setIsModalVisible] = useState<boolean>(false); // 控制模态框的显示
    const [uploadTargetFolder, setUploadTargetFolder] = useState<string | undefined>(undefined); // 新增：用于上传的目标文件夹
    const { user } = useAuth(); // 解构 user
    const [viewMode, setViewMode] = useState<'icon' | 'list'>('icon'); // 新增：视图模式状态，默认为图标模式

    // 重命名文件夹相关的状态
    const [isRenameModalVisible, setIsRenameModalVisible] = useState<boolean>(false);
    const [folderToRename, setFolderToRename] = useState<string | undefined>(undefined);
    const [newRenameFolderName, setNewRenameFolderName] = useState<string>('');

    // 重命名文件相关的状态
    const [isMediaRenameModalVisible, setIsMediaRenameModalVisible] = useState<boolean>(false);
    const [mediaFileToRename, setMediaFileToRename] = useState<Media | undefined>(undefined);
    const [newMediaFileName, setNewMediaFileName] = useState<string>('');

    const showModal = () => {
        setIsModalVisible(true);
    };

    const handleOk = async () => {
        const trimmedFolderName = newFolderName.trim();
        if (!trimmedFolderName) {
            message.error('文件夹名称不能为空');
            return;
        }

        // 检查是否与保留关键字冲突
        if (trimmedFolderName === 'action-create-folder' || trimmedFolderName === 'uncategorized' || trimmedFolderName === 'create-folder') {
            message.warning(`文件夹名称 '${trimmedFolderName}' 是保留字，请使用其他名称`);
            return;
        }

        try {
            // 调用后端 API 创建文件夹
            await createFolder(trimmedFolderName);
            message.success(`文件夹 '${trimmedFolderName}' 已创建成功`);
            setNewFolderName('');
            setIsModalVisible(false);
            fetchMedia(currentFolder); // 刷新文件夹列表
        } catch (error: any) {
            console.error("Error creating folder:", error);
            message.error(`创建文件夹失败: ${error.message}`);
        }
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setNewFolderName('');
    };

    const fetchMedia = async (folder?: string) => {
        
        // 过滤掉保留的文件夹名称，防止发送无效请求
        const reservedNames = ['action-create-folder', 'create-folder'];
        if (folder && reservedNames.includes(folder)) {
            // 如果是保留名称，重置为显示所有媒体
            setCurrentFolder(undefined);
            return;
        }
        
        setLoading(true);
        try {
            // 不再传递 user.id
            const { media, folders: fetchedFolders } = await getMediaList(folder);
            
            // 确保 media 是数组
            setMediaList(Array.isArray(media) ? media : []);

            // 后端返回的 folders 使用字段 `media_count`，前端期望 `count`
            // 转换数据格式以匹配前端接口
            const convertedFolders = Array.isArray(fetchedFolders) ? fetchedFolders.map(f => ({
                name: f.name,
                count: f.media_count
            })) : [];
            setFolders(convertedFolders);
            
        } catch (error: any) {
            console.error("Error in fetchMedia:", error);
            message.error(error.message);
            // 确保在错误情况下也设置默认值
            setMediaList([]);
            setFolders([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            setLoading(true); // 在开始获取数据之前立即设置为加载状态
            fetchMedia(currentFolder);
            setUploadTargetFolder(currentFolder); // 同步上传目标文件夹
        } else {
            // 如果用户未认证，确保加载状态被清除或显示未认证信息
            setLoading(false);
            setMediaList([]);
            setFolders([]);
        }
    }, [user, currentFolder]);

    const handleUpload = async (options: any) => {
        const { file } = options;
        const hide = message.loading(`正在上传 ${file.name}...`, 0); // 显示全局加载提示
        try {
            // 不再传递 user.id
            await uploadMedia(file, uploadTargetFolder); // 使用 uploadTargetFolder
            message.success(`${file.name} 上传成功`);
            fetchMedia(currentFolder); // Refresh list
        } catch (error: any) {
            message.error(`上传失败: ${error.message}`);
        } finally {
            hide(); // 隐藏加载提示
        }
    };

    const handleMenuClick = (e: any) => {
        // 忽略特殊的 action keys，只处理真正的文件夹选择
        if (e.key === 'all') {
            setCurrentFolder(undefined);
        } else if (e.key === 'action-create-folder') {
            // 这是"创建新文件夹"按钮，不应该改变当前文件夹
            return;
        } else if (e.key === 'uncategorized') {
            setCurrentFolder('uncategorized'); // 明确设置为 'uncategorized'
        } else {
            setCurrentFolder(e.key);
        }
    };

    const handleDeleteMedia = async (mediaId: string) => {
        try {
            // 不再传递 user.id
            await deleteMedia(mediaId);
            message.success('媒体文件删除成功');
            fetchMedia(currentFolder); // 刷新列表
        } catch (error: any) {
            message.error(`删除失败: ${error.message}`);
        }
    };

    const handleDeleteFolder = async (folderName: string) => {
        if (folderName === '未分类') {
            message.error('不能删除“未分类”文件夹。');
            return;
        }

        try {
            await deleteFolder(folderName);
            message.success(`文件夹 '${folderName}' 删除成功`);
            // 如果删除的是当前查看的文件夹，则跳转到“所有媒体”
            if (currentFolder === folderName) {
                setCurrentFolder(undefined);
            }
            fetchMedia(undefined); // 刷新所有媒体和文件夹列表
        } catch (error: any) {
            message.error(`删除文件夹失败: ${error.message}`);
        }
    };

    // 处理重命名文件夹
    const handleShowRenameModal = (folderName: string) => {
        setFolderToRename(folderName);
        setNewRenameFolderName(folderName); // 预填当前名称
        setIsRenameModalVisible(true);
    };

    const handleRenameOk = async () => {
        if (!folderToRename) return;

        const trimmedNewFolderName = newRenameFolderName.trim();
        if (!trimmedNewFolderName) {
            message.error('新文件夹名称不能为空');
            return;
        }

        if (trimmedNewFolderName === folderToRename) {
            message.info('文件夹名称未改变');
            setIsRenameModalVisible(false);
            return;
        }

        // 检查是否与保留关键字冲突
        if (trimmedNewFolderName === 'action-create-folder' || trimmedNewFolderName === 'uncategorized' || trimmedNewFolderName === 'create-folder') {
            message.warning(`文件夹名称 '${trimmedNewFolderName}' 是保留字，请使用其他名称`);
            return;
        }

        try {
            await renameFolder(folderToRename, trimmedNewFolderName);
            message.success(`文件夹 '${folderToRename}' 已成功重命名为 '${trimmedNewFolderName}'`);
            setIsRenameModalVisible(false);
            setNewRenameFolderName('');
            setFolderToRename(undefined);
            // 确保从后端重新加载最新的文件夹和媒体，优先显示重命名后的文件夹
            setCurrentFolder(trimmedNewFolderName);
            await fetchMedia(trimmedNewFolderName);
        } catch (error: any) {
            message.error(`重命名文件夹失败: ${error.message}`);
        }
    };

    const handleRenameCancel = () => {
        setIsRenameModalVisible(false);
        setNewRenameFolderName('');
        setFolderToRename(undefined);
    };

    // 处理显示文件重命名模态框
    const handleShowMediaRenameModal = (media: Media) => {
        setMediaFileToRename(media);
        setNewMediaFileName(media.filename); // 预填当前文件名
        setIsMediaRenameModalVisible(true);
    };

    // 处理文件重命名确认
    const handleMediaRenameOk = async () => {
        if (!mediaFileToRename) return;

        const trimmedNewFileName = newMediaFileName.trim();
        if (!trimmedNewFileName) {
            message.error('新文件名不能为空');
            return;
        }

        if (trimmedNewFileName === mediaFileToRename.filename) {
            message.info('文件名未改变');
            setIsMediaRenameModalVisible(false);
            return;
        }

        try {
            await renameMedia(mediaFileToRename.id, trimmedNewFileName);
            message.success(`文件 '${mediaFileToRename.filename}' 已成功重命名为 '${trimmedNewFileName}'`);
            setIsMediaRenameModalVisible(false);
            setNewMediaFileName('');
            setMediaFileToRename(undefined);
            fetchMedia(currentFolder); // 刷新列表
        } catch (error: any) {
            message.error(`重命名文件失败: ${error.message}`);
        }
    };

    // 处理文件重命名取消
    const handleMediaRenameCancel = () => {
        setIsMediaRenameModalVisible(false);
        setNewMediaFileName('');
        setMediaFileToRename(undefined);
    };

    // 处理文件夹点击事件
    const handleFolderClick = (folderName: string) => {
        setCurrentFolder(folderName);
    };

    // Render media items
    const renderMediaItems = (mediaItems: Media[], foldersToRender: MediaManagementFolder[]) => {
        // 根据当前文件夹过滤媒体文件
        let filteredMedia: Media[] = [];
        let displayFolders: MediaManagementFolder[] = [];

        if (currentFolder === undefined) { // "所有媒体" 视图
            // 显示所有顶层文件夹
            displayFolders = foldersToRender.filter(f => f.name !== '未分类');
            // 显示根目录下的未分类文件
            filteredMedia = mediaItems.filter(media => media.folder === undefined || media.folder === null);
        } else if (currentFolder === 'uncategorized') { // "未分类" 视图
            filteredMedia = mediaItems.filter(media => media.folder === undefined || media.folder === null);
        } else { // 特定文件夹视图
            filteredMedia = mediaItems.filter(media => media.folder === currentFolder);
        }

        // 检查是否有任何内容需要显示
        if (filteredMedia.length === 0 && displayFolders.length === 0) {
            return <p>没有媒体文件或文件夹。开始上传吧！</p>;
        }

        const renderFileItem = (media: Media) => {
            const fileIcon = (() => {
                if (media.file_type?.startsWith('video')) {
                    return <PlayCircleOutlined style={{ fontSize: 36, color: '#000000' }} />;
                } else if (media.file_type === 'application/pdf') {
                    return <FilePdfOutlined style={{ fontSize: 36, color: '#f40f02' }} />;
                } else if (media.file_type?.includes('word')) {
                    return <FileWordOutlined style={{ fontSize: 36, color: '#2b579a' }} />;
                } else if (media.file_type?.includes('excel')) {
                    return <FileExcelOutlined style={{ fontSize: 36, color: '#217346' }} />;
                } else if (media.file_type === 'text/plain') {
                    return <FileTextOutlined style={{ fontSize: 36, color: '#607d8b' }} />;
                }
                return <FileOutlined style={{ fontSize: 36, color: '#bfbfbf' }} />;
            })();

            const commonActions = [
                <Popconfirm
                    title="确定删除此媒体文件吗?"
                    onConfirm={() => handleDeleteMedia(media.id)}
                    okText="是"
                    cancelText="否"
                    icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                >
                    <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>,
                <Button
                    type="link"
                    icon={<EditOutlined />}
                    onClick={() => handleShowMediaRenameModal(media)}
                >
                    重命名
                </Button>,
            ];

            if (viewMode === 'icon') {
                return (
                    <Col xs={24} sm={12} md={8} lg={6} key={media.id}>
                        <Card
                            hoverable
                            cover={media.file_type?.startsWith('image') ? (
                                <Image alt={media.filename} src={media.file_url} style={{ height: 200, objectFit: 'cover' }} />
                            ) : (
                                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', flexDirection: 'column' }}>
                                    {media.file_type?.startsWith('video') ? (
                                        <video controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} src={media.file_url}>
                                            Your browser does not support the video tag.
                                        </video>
                                    ) : fileIcon}
                                    <p style={{ marginTop: 8, textAlign: 'center' }}>{media.file_type || '未知文件类型'}</p>
                                </div>
                            )}
                            actions={commonActions}
                        >
                            <Card.Meta
                                title={media.filename}
                                description={media.folder ? `文件夹: ${media.folder}` : '未分类'}
                            />
                        </Card>
                    </Col>
                );
            } else { // List mode
                return (
                    <List.Item
                        key={media.id}
                        actions={commonActions}
                        style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}
                    >
                        <List.Item.Meta
                            avatar={media.file_type?.startsWith('image') ? (
                                <Avatar src={media.file_url} shape="square" size={48} />
                            ) : (
                                <Avatar icon={fileIcon} shape="square" size={48} style={{ backgroundColor: '#e6f7ff' }} />
                            )}
                            title={<Typography.Text strong>{media.filename}</Typography.Text>}
                            description={<Typography.Text type="secondary" style={{ fontSize: '0.9em' }}>文件夹: {media.folder || '未分类'}</Typography.Text>}
                        />
                        <Space size="small" style={{ fontSize: '0.9em', color: '#718096' }}>
                            <span>{media.file_type}</span>
                            <span>{media.size ? `${(media.size / 1024).toFixed(2)} KB` : ''}</span>
                            <span>{media.updated_at ? new Date(media.updated_at).toLocaleDateString() : ''}</span>
                        </Space>
                    </List.Item>
                );
            }
        };

        const renderFolderItem = (folder: MediaManagementFolder) => {
            const folderActions = [
                <Popconfirm
                    title={`确定删除文件夹 '${folder.name}' 及其所有内容吗?`}
                    onConfirm={() => handleDeleteFolder(folder.name)}
                    okText="是"
                    cancelText="否"
                    placement="right"
                    icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                >
                    <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>,
                <Button
                    type="link"
                    icon={<EditOutlined />}
                    onClick={e => {
                        e.stopPropagation();
                        handleShowRenameModal(folder.name);
                    }}
                >
                    重命名
                </Button>,
            ];

            if (viewMode === 'icon') {
                return (
                    <Col xs={24} sm={12} md={8} lg={6} key={folder.name}>
                        <Card
                            hoverable
                            onClick={() => handleFolderClick(folder.name)}
                            actions={folderActions}
                            style={{ cursor: 'pointer', height: 200, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
                        >
                            <FolderOutlined style={{ fontSize: 60, color: '#ffd666', marginBottom: 10 }} />
                            <Card.Meta
                                title={<Title level={5} style={{ margin: 0, textAlign: 'center' }}>{`${folder.name} (${folder.count})`}</Title>}
                            />
                        </Card>
                    </Col>
                );
            } else { // List mode
                return (
                    <List.Item
                        key={folder.name}
                        actions={folderActions}
                        onClick={() => handleFolderClick(folder.name)}
                        style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                    >
                        <List.Item.Meta
                            avatar={<Avatar icon={<FolderOutlined />} shape="square" size={48} style={{ backgroundColor: '#ffd666' }} />}
                            title={<Typography.Text strong>{`${folder.name} (${folder.count})`}</Typography.Text>}
                            description={<Typography.Text type="secondary">文件夹</Typography.Text>}
                        />
                    </List.Item>
                );
            }
        };

        return (
            <div className="media-items-container">
                {displayFolders.length > 0 && (
                    viewMode === 'icon' ? (
                        <Row gutter={[16, 16]} style={{ marginBottom: displayFolders.length > 0 && filteredMedia.length > 0 ? '24px' : '0' }}>
                            {displayFolders.map(renderFolderItem)}
                        </Row>
                    ) : (
                        <List
                            itemLayout="horizontal"
                            dataSource={displayFolders}
                            renderItem={renderFolderItem}
                            style={{ marginBottom: displayFolders.length > 0 && filteredMedia.length > 0 ? '24px' : '0' }}
                        />
                    )
                )}
                {filteredMedia.length > 0 && (
                    viewMode === 'icon' ? (
                        <Row gutter={[16, 16]}>
                            {filteredMedia.map(renderFileItem)}
                        </Row>
                    ) : (
                        <List
                            itemLayout="horizontal"
                            dataSource={filteredMedia}
                            renderItem={renderFileItem}
                        />
                    )
                )}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#f7fafc' }}>
            <Head>
                <title>媒体管理 - CRM Automation</title>
            </Head>
            <Sidebar currentPage="/media-management" />

            {/* 主内容区域 */}
            <div style={{
                flex: 1,
                marginLeft: '70px',
                transition: 'margin-left 0.3s ease',
                padding: '10px 15px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* 标题区域 */}
                <div style={{ marginBottom: '15px', padding: '10px 0' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#2d3748', margin: 0 }}>
                        <FolderOutlined style={{ marginRight: '10px' }} />媒体库
                    </h1>
                    <p style={{ color: '#718096', marginTop: '5px', fontSize: '16px' }}>
                        在此管理您的所有媒体文件，支持文件夹分类和快速检索。
                    </p>
                </div>

                {/* 内容区域：左侧文件夹导航 + 右侧媒体展示 */}
                <div style={{ display: 'flex', gap: '15px', flex: 1, overflow: 'hidden' }}>
                    {/* 左侧文件夹导航 */}
                    <div style={{ width: '250px', flexShrink: 0, overflowY: 'auto', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)' }}>
                        <Menu
                            mode="inline"
                            selectedKeys={currentFolder ? [currentFolder] : ['all']}
                            style={{ height: '100%', borderRight: 0, borderRadius: '8px' }}
                            onClick={handleMenuClick}
                            items={[
                                {
                                    key: 'all',
                                    icon: <FolderOutlined />,
                                    label: '所有媒体',
                                },
                                { type: 'divider' },
                                {
                                    key: 'folders-group',
                                    label: '文件夹',
                                    type: 'group',
                                    children: [
                                        {
                                            key: 'action-create-folder',
                                            icon: <FolderOutlined />,
                                            label: '创建新文件夹',
                                            onClick: (e) => {
                                                e.domEvent.stopPropagation(); // 阻止事件冒泡
                                                showModal();
                                            },
                                        },
                                        ...folders.filter(f => f.name !== 'action-create-folder' && f.name !== 'create-folder' && f.name !== '未分类').map(folder => {
                                            return ({
                                                key: folder.name,
                                                icon: <FolderOutlined />,
                                                label: (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>{`${folder.name} (${folder.count})`}</span>
                                                        {folder.name !== '未分类' && (
                                                            <Space size="small">
                                                                <Button
                                                                    type="text"
                                                                    icon={<EditOutlined style={{ color: '#1890ff' }} />}
                                                                    size="small"
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        handleShowRenameModal(folder.name);
                                                                    }}
                                                                />
                                                                <Popconfirm
                                                                    title={`确定删除文件夹 '${folder.name}' 及其所有内容吗?`}
                                                                    onConfirm={(e) => {
                                                                        e?.stopPropagation(); // 阻止事件冒泡
                                                                        handleDeleteFolder(folder.name);
                                                                    }}
                                                                    okText="是"
                                                                    cancelText="否"
                                                                    placement="right"
                                                                    icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                                                                >
                                                                    <Button
                                                                        type="text"
                                                                        icon={<DeleteOutlined style={{ color: '#ff4d4f' }} />}
                                                                        size="small"
                                                                        onClick={e => e.stopPropagation()} // 阻止点击菜单项的默认行为
                                                                    />
                                                                </Popconfirm>
                                                            </Space>
                                                        )}
                                                    </div>
                                                ),
                                                // 如果文件夹被点击，确保不触发删除，只切换文件夹
                                                onClick: (e) => {
                                                    e.domEvent.stopPropagation(); // 阻止事件冒泡
                                                    handleFolderClick(folder.name); // 直接调用 handleFolderClick
                                                },
                                            })
                                        }),
                                        {
                                            key: 'uncategorized',
                                            icon: <FolderOutlined />,
                                            label: `未分类 (${folders.find(f => f.name === '未分类')?.count || 0})`,
                                        },
                                    ],
                                },
                            ]}
                        />
                    </div>

                    {/* 右侧媒体展示区 */}
                    <Layout style={{ flex: 1, backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)' }}>
                        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '8px 8px 0 0' }}>
                            <Title level={4} style={{ margin: 0 }}>{currentFolder || '所有媒体'}</Title>
                            <Space>
                                <Segmented
                                    options={[
                                        { label: '图标', value: 'icon', icon: <AppstoreOutlined /> },
                                        { label: '列表', value: 'list', icon: <UnorderedListOutlined /> },
                                    ]}
                                    value={viewMode}
                                    onChange={(value: string) => setViewMode(value as 'icon' | 'list')}
                                />
                                <Search placeholder="搜索媒体文件" style={{ width: 200 }} onSearch={(value) => console.log(value)} />
                                <Select
                                    value={uploadTargetFolder === undefined ? 'uncategorized' : uploadTargetFolder}
                                    style={{ width: 150 }}
                                    onChange={(value: string) => setUploadTargetFolder(value === 'uncategorized' ? undefined : value)}
                                    placeholder="选择上传文件夹"
                                >
                                    <Option value="uncategorized">未分类</Option>
                                    {folders.filter(f => f.name !== 'action-create-folder' && f.name !== 'create-folder').map(folder => (
                                        <Option key={folder.name} value={folder.name}>{folder.name}</Option>
                                    ))}
                                </Select>
                            </Space>
                        </Header>
                        <Content style={{ margin: '0', overflow: 'auto', padding: '24px' }}>
                            <div style={{ marginBottom: '24px', border: '2px dashed #d9d9d9', borderRadius: '8px', padding: '20px' }}>
                                <Upload.Dragger
                                    customRequest={handleUpload}
                                    showUploadList={false}
                                    accept="image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
                                    style={{ background: 'transparent', border: 'none' }}
                                >
                                    <p className="ant-upload-drag-icon">
                                        <UploadOutlined style={{ fontSize: '60px', color: '#1890ff' }} />
                                    </p>
                                    <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                                    <p className="ant-upload-hint">支持单文件或批量上传到选定文件夹</p>
                                </Upload.Dragger>
                            </div>
                            {loading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                                    <Spin size="large" tip="加载媒体文件中..." />
                                </div>
                            ) : (
                                renderMediaItems(mediaList, folders)
                            )}
                        </Content>
                        <Footer style={{ textAlign: 'center', borderRadius: '0 0 8px 8px' }}>CRM Automation ©2023 Created by You</Footer>
                    </Layout>
                </div>
                <Modal
                    title="创建新文件夹"
                    open={isModalVisible}
                    onOk={handleOk}
                    onCancel={handleCancel}
                    okText="创建"
                    cancelText="取消"
                >
                    <Input
                        placeholder="请输入文件夹名称"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onPressEnter={handleOk}
                    />
                </Modal>
                <Modal
                    title="重命名文件夹"
                    open={isRenameModalVisible}
                    onOk={handleRenameOk}
                    onCancel={handleRenameCancel}
                    okText="重命名"
                    cancelText="取消"
                >
                    <Input
                        placeholder="请输入新的文件夹名称"
                        value={newRenameFolderName}
                        onChange={(e) => setNewRenameFolderName(e.target.value)}
                        onPressEnter={handleRenameOk}
                    />
                </Modal>
                <Modal
                    title="重命名文件"
                    open={isMediaRenameModalVisible}
                    onOk={handleMediaRenameOk}
                    onCancel={handleMediaRenameCancel}
                    okText="重命名"
                    cancelText="取消"
                >
                    <Input
                        placeholder="请输入新的文件名"
                        value={newMediaFileName}
                        onChange={(e) => setNewMediaFileName(e.target.value)}
                        onPressEnter={handleMediaRenameOk}
                    />
                </Modal>
            </div>
        </div>
    );
};

export default MediaManagement;
