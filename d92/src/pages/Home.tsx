import { Link } from 'react-router-dom';
import { Upload, Globe, List, Database, ChevronRight } from 'lucide-react';

const Home = () => {
  const features = [
    {
      icon: Upload,
      title: '分块上传',
      description: '支持大文件分块上传，断点续传，确保FITS格式数据可靠传输',
      link: '/upload',
    },
    {
      icon: Globe,
      title: '天球检索',
      description: '基于Leaflet的交互式天球图，支持框选区域进行空间检索',
      link: '/sky-map',
    },
    {
      icon: List,
      title: '数据管理',
      description: '完整的元数据管理，包括观测时间、频率范围、赤经赤纬等信息',
      link: '/data',
    },
  ];

  return (
    <div className="space-y-12">
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-cosmic-500 to-space-800 rounded-2xl mb-6 shadow-lg shadow-cosmic-500/20">
          <Database className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">
          射电望远镜数据归档系统
        </h1>
        <p className="text-xl text-nebula-400 max-w-2xl mx-auto">
          专业的天文观测数据存储与检索平台，支持FITS格式数据的分块上传和空间查询
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Link
              key={feature.title}
              to={feature.link}
              className="group glass-card p-6 rounded-xl hover:border-cosmic-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-cosmic-500/10"
            >
              <div className="w-12 h-12 bg-cosmic-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-cosmic-500/30 transition-colors">
                <Icon className="w-6 h-6 text-cosmic-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-nebula-400 text-sm mb-4">{feature.description}</p>
              <div className="flex items-center text-cosmic-500 text-sm font-medium">
                <span>开始使用</span>
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="glass-card rounded-xl p-8">
        <h2 className="text-2xl font-bold text-white mb-6">技术特性</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-cosmic-500 rounded-full mt-2" />
              <div>
                <h4 className="text-white font-medium">SHA-256哈希校验</h4>
                <p className="text-nebula-400 text-sm">确保数据完整性，防止重复上传</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-cosmic-500 rounded-full mt-2" />
              <div>
                <h4 className="text-white font-medium">PostGIS空间查询</h4>
                <p className="text-nebula-400 text-sm">高效的地理空间数据检索</p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-cosmic-500 rounded-full mt-2" />
              <div>
                <h4 className="text-white font-medium">FITS元数据提取</h4>
                <p className="text-nebula-400 text-sm">自动解析FITS文件头信息</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-cosmic-500 rounded-full mt-2" />
              <div>
                <h4 className="text-white font-medium">并发分块上传</h4>
                <p className="text-nebula-400 text-sm">支持多块同时上传，提高传输效率</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
