import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { Layout, Menu, Breadcrumb, Button, Upload, message, Card, Image, Row, Col, Typography, Input, Space, Popconfirm, Modal, Select } from 'antd';
import { UploadOutlined, FolderOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Media, uploadMedia, getMediaList, deleteMedia } from '../services/media';
import { useAuth } from '../hooks/useAuth';
import Sidebar from '../components/Sidebar'; // 导入 Sidebar 组件
import { useRouter } from 'next/router'; // 导入 useRouter

const { Header, Content, Footer } = Layout; // 移除 Sider
const { Title } = Typography;
const { Search } = Input;
const { Option } = Select; // 解构 Option

interface Folder {
    name: string;
    count: number;
}

const MediaManagement: React.FC = () => {
    const [mediaList, setMediaList] = useState<Media[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [currentFolder, setCurrentFolder] = useState<string | undefined>(undefined);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [newFolderName, setNewFolderName] = useState<string>(''); // 用于新文件夹名称的 state
    const [isModalVisible, setIsModalVisible] = useState<boolean>(false); // 控制模态框的显示
    const [uploadTargetFolder, setUploadTargetFolder] = useState<string | undefined>(undefined); // 新增：用于上传的目标文件夹
    const { user } = useAuth(); // 解构 user

    const showModal = () => {
        setIsModalVisible(true);
    };

    const handleOk = () => {
        if (newFolderName.trim() && !folders.some(f => f.name === newFolderName.trim())) {
            // 模拟添加到文件夹列表，实际创建会在文件上传时发生
            setFolders(prev => [...prev, { name: newFolderName.trim(), count: 0 }]);
            message.success(`文件夹 '${newFolderName.trim()}' 已添加`);
            setNewFolderName('');
            setIsModalVisible(false);
        } else if (folders.some(f => f.name === newFolderName.trim())) {
            message.warning('文件夹已存在');
        } else {
            message.error('文件夹名称不能为空');
        }
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setNewFolderName('');
    };

    const fetchMedia = async (folder?: string) => {
        setLoading(true);
        try {
            const { media, folders } = await getMediaList(folder, String(user.id)); // 确保传递 user.id 并转换为字符串
            setMediaList(media);

            // Extract unique folders and their counts
            // 这里的逻辑可以简化，因为 getMediaList 已经返回了 folders
            // const folderMap: { [key: string]: number } = {};
            // media.forEach(item => {
            //     const folderName = item.folder || '未分类';
            //     folderMap[folderName] = (folderMap[folderName] || 0) + 1;
            // });
            // const newFolders: Folder[] = Object.entries(folderMap).map(([name, count]) => ({ name, count }));
            // 后端返回的 folders 使用字段 `media_count`，前端期望 `count`
            setFolders(folders.map((f: any) => ({ name: f.name, count: f.media_count })));

        } catch (error: any) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchMedia(currentFolder);
            setUploadTargetFolder(currentFolder); // 同步上传目标文件夹
        }
    }, [user, currentFolder]);

    const handleUpload = async (options: any) => {
        const { file } = options;
        try {
            // 确保传递 user.id
            await uploadMedia(file, uploadTargetFolder, String(user.id)); // 使用 uploadTargetFolder 并转换为字符串
            message.success(`${file.name} 上传成功`);
            fetchMedia(currentFolder); // Refresh list
        } catch (error: any) {
            message.error(`上传失败: ${error.message}`);
        }
    };

    const handleMenuClick = (e: any) => {
        setCurrentFolder(e.key === 'all' ? undefined : e.key);
    };

    const handleDeleteMedia = async (mediaId: string) => {
        try {
            // 确保传递 user.id
            await deleteMedia(mediaId, String(user.id));
            message.success('媒体文件删除成功');
            fetchMedia(currentFolder); // 刷新列表
        } catch (error: any) {
            message.error(`删除失败: ${error.message}`);
        }
    };

    // Render media items
    const renderMediaItems = () => (
        <Row gutter={[16, 16]}>
            {mediaList.map((media) => (
                <Col xs={24} sm={12} md={8} lg={6} key={media.id}>
                    <Card
                        hoverable
                        cover={media.type?.startsWith('image') ? (
                            <Image alt={media.name} src={media.url} style={{ height: 200, objectFit: 'cover' }} />
                        ) : (
                            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0' }}>
                                <FolderOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
                                <p>{media.type || '未知文件类型'}</p>
                            </div>
                        )}
                        actions={[
                            <Popconfirm
                                title="确定删除此媒体文件吗?"
                                onConfirm={() => handleDeleteMedia(media.id)}
                                okText="是"
                                cancelText="否"
                                icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                            >
                                <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                            </Popconfirm>
                        ]}
                    >
                        <Card.Meta
                            title={media.name}
                            description={media.folder ? `文件夹: ${media.folder}` : '未分类'}
                        />
                    </Card>
                </Col>
            ))}
        </Row>
    );

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
                                            key: 'create-folder',
                                            icon: <FolderOutlined />,
                                            label: '创建新文件夹',
                                            onClick: showModal,
                                        },
                                        ...folders.filter(f => f.name !== '未分类').map(folder => ({
                                            key: folder.name,
                                            icon: <FolderOutlined />,
                                            label: `${folder.name} (${folder.count})`,
                                        })),
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
                                <Search placeholder="搜索媒体文件" style={{ width: 200 }} onSearch={(value) => console.log(value)} />
                                <Select
                                    value={uploadTargetFolder}
                                    style={{ width: 150 }}
                                    onChange={(value: string) => setUploadTargetFolder(value === 'uncategorized' ? undefined : value)}
                                    placeholder="选择上传文件夹"
                                >
                                    <Option value="uncategorized">未分类</Option>
                                    {folders.filter(f => f.name !== '未分类').map(folder => (
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
                                    accept="image/*,video/*"
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
                                <p>加载中...</p>
                            ) : mediaList.length === 0 ? (
                                <p>没有媒体文件。开始上传吧！</p>
                            ) : (
                                renderMediaItems()
                            )}
                        </Content>
                        <Footer style={{ textAlign: 'center', borderRadius: '0 0 8px 8px' }}>CRM Automation ©2023 Created by You</Footer>
                    </Layout>
                </div>
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
        </div>
    );
};

export default MediaManagement;
