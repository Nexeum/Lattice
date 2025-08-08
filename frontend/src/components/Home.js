import React, { useState, useEffect } from "react";
import { 
  Container, 
  Play, 
  Activity, 
  Shield, 
  Zap,
  ArrowRight,
  BarChart3
} from "lucide-react";

import { useHistory } from "react-router-dom";


export const Home = () => {
    const [stats, setStats] = useState({
        containers: 12,
        activeJobs: 3,
        uptime: "99.8%"
    });

    const history = useHistory();

    const navigateToAuth = () => {
        history.push("/auth");
    };

    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
        
        const interval = setInterval(() => {
            setStats(prev => ({
                ...prev,
                containers: prev.containers + Math.floor(Math.random() * 3) - 1,
                activeJobs: Math.max(0, prev.activeJobs + Math.floor(Math.random() * 3) - 1)
            }));
        }, 4000);

        return () => clearInterval(interval);
    }, []);

    const features = [
        {
            icon: Container,
            title: "Intelligent Orchestration",
            description: "Advanced container lifecycle management with ML-powered optimization that adapts to your workflow patterns.",
            accent: "blue"
        },
        {
            icon: Activity,
            title: "Real-time Analytics",
            description: "Beautiful insights with predictive monitoring that helps you stay ahead of performance issues.",
            accent: "green"
        },
        {
            icon: Zap,
            title: "Effortless Scaling",
            description: "Seamless auto-scaling that intelligently responds to demand without any configuration.",
            accent: "purple"
        },
        {
            icon: Shield,
            title: "Enterprise Security",
            description: "Zero-trust architecture with end-to-end encryption designed for mission-critical workloads.",
            accent: "orange"
        }
    ];

    return (
        <div className="min-h-screen bg-white">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
                <div className="max-w-6xl mx-auto px-6 py-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                                <Container className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-xl font-medium text-gray-900">Lattice</span>
                        </div>
                        
                        <div className="hidden md:flex items-center space-x-8">
                            <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Features</a>
                            <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Pricing</a>
                            <a href="#docs" className="text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">Docs</a>
                        </div>
                        
                        <button className="px-5 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors" onClick={navigateToAuth}>
                            Sign In
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <div className={`transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <div className="inline-flex items-center px-3 py-1 bg-gray-50 text-gray-600 rounded-full text-sm font-medium mb-8 border border-gray-200">
                            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                            Now with AI-powered optimization
                        </div>
                        
                        <h1 className="text-5xl md:text-7xl font-light text-gray-900 mb-6 tracking-tight leading-none">
                            Docker orchestration.
                            <br />
                            <span className="font-normal">Reimagined.</span>
                        </h1>
                        
                        <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto font-light leading-relaxed">
                            Experience the most advanced Docker-in-Docker platform with intelligent automation, 
                            beautiful insights, and enterprise-grade security.
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
                            <button className="group px-8 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium">
                                Get Started
                                <ArrowRight className="inline ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                            <button className="px-8 py-3 text-gray-700 hover:text-gray-900 transition-colors duration-200 font-medium border border-gray-200 rounded-full hover:border-gray-300">
                                Watch Demo
                            </button>
                        </div>
                    </div>

                    {/* Hero Image Placeholder */}
                    <div className={`transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <div className="relative max-w-5xl mx-auto mb-20">
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-3xl p-8 shadow-2xl border border-gray-200">
                                <div className="bg-black rounded-2xl p-6 text-left">
                                    <div className="flex items-center space-x-2 mb-4">
                                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                    </div>
                                    <div className="font-mono text-green-400 text-sm">
                                        <div className="opacity-80">$ lattice deploy --scale-auto</div>
                                        <div className="text-gray-400 mt-2">✓ Containers deployed successfully</div>
                                        <div className="text-gray-400">✓ Auto-scaling enabled</div>
                                        <div className="text-gray-400">✓ Security policies applied</div>
                                        <div className="text-blue-400 mt-2">→ Dashboard: https://app.Lattice.io</div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Floating cards */}
                            <div className="absolute -top-4 -left-4 bg-white rounded-2xl p-4 shadow-lg border border-gray-200 animate-pulse">
                                <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                        <Activity className="w-4 h-4 text-green-600" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium">CPU Usage</div>
                                        <div className="text-xs text-gray-500">32%</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl p-4 shadow-lg border border-gray-200 animate-pulse" style={{animationDelay: '1s'}}>
                                <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                        <Container className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium">Active</div>
                                        <div className="text-xs text-gray-500">{stats.containers} containers</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="py-20 bg-gray-50">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl mb-6">
                                <Container className="w-7 h-7 text-blue-600" />
                            </div>
                            <div className="text-5xl font-light text-gray-900 mb-2">{stats.containers}</div>
                            <div className="text-gray-600 font-medium">Active Containers</div>
                            <div className="text-sm text-gray-500 mt-1">Across all environments</div>
                        </div>
                        
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-50 rounded-2xl mb-6">
                                <Play className="w-7 h-7 text-green-600" />
                            </div>
                            <div className="text-5xl font-light text-gray-900 mb-2">{stats.activeJobs}</div>
                            <div className="text-gray-600 font-medium">Running Jobs</div>
                            <div className="text-sm text-gray-500 mt-1">Processing workloads</div>
                        </div>
                        
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-50 rounded-2xl mb-6">
                                <BarChart3 className="w-7 h-7 text-purple-600" />
                            </div>
                            <div className="text-5xl font-light text-gray-900 mb-2">{stats.uptime}</div>
                            <div className="text-gray-600 font-medium">System Uptime</div>
                            <div className="text-sm text-gray-500 mt-1">This month</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-32 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-20">
                        <h2 className="text-4xl md:text-6xl font-light text-gray-900 mb-6">
                            Built for the way
                            <br />
                            you work.
                        </h2>
                        <p className="text-xl text-gray-600 max-w-3xl mx-auto font-light">
                            Every feature is designed to make container orchestration more intuitive, 
                            more powerful, and more delightful.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {features.map((feature, index) => (
                            <div
                                key={index}
                                className="group bg-white rounded-3xl p-8 border border-gray-100 hover:border-gray-200 transition-all duration-500 hover:shadow-lg"
                            >
                                <div className={`w-12 h-12 rounded-2xl mb-6 flex items-center justify-center ${
                                    feature.accent === 'blue' ? 'bg-blue-50' :
                                    feature.accent === 'green' ? 'bg-green-50' :
                                    feature.accent === 'purple' ? 'bg-purple-50' :
                                    'bg-orange-50'
                                }`}>
                                    <feature.icon className={`w-6 h-6 ${
                                        feature.accent === 'blue' ? 'text-blue-600' :
                                        feature.accent === 'green' ? 'text-green-600' :
                                        feature.accent === 'purple' ? 'text-purple-600' :
                                        'text-orange-600'
                                    }`} />
                                </div>
                                <h3 className="text-2xl font-medium text-gray-900 mb-4">{feature.title}</h3>
                                <p className="text-gray-600 leading-relaxed text-lg">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-32 px-6 bg-black">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-4xl md:text-6xl font-light text-white mb-6">
                        Ready to get started?
                    </h2>
                    <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto font-light">
                        Join thousands of developers who've transformed their workflow with Lattice.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button className="px-8 py-3 bg-white text-black rounded-full hover:bg-gray-100 transition-all duration-200 font-medium">
                            Start Free Trial
                        </button>
                        <button className="px-8 py-3 border border-gray-600 text-white rounded-full hover:border-gray-500 hover:bg-gray-900 transition-all duration-200 font-medium">
                            Contact Sales
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-16 px-6 bg-gray-50">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <div className="flex items-center space-x-3 mb-4 md:mb-0">
                            <div className="w-6 h-6 bg-black rounded-lg flex items-center justify-center">
                                <Container className="w-3 h-3 text-white" />
                            </div>
                            <span className="text-lg font-medium text-gray-900">Lattice</span>
                        </div>
                        
                        <div className="flex items-center space-x-8 text-sm text-gray-600">
                            <a href="#" className="hover:text-gray-900 transition-colors">Privacy</a>
                            <a href="#" className="hover:text-gray-900 transition-colors">Terms</a>
                            <a href="#" className="hover:text-gray-900 transition-colors">Support</a>
                        </div>
                    </div>
                    
                    <div className="border-t border-gray-200 mt-8 pt-8 text-center">
                        <p className="text-sm text-gray-500">
                            © 2025 Lattice. Built for developers worldwide.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}