import React, { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { 
  Plus, 
  Users, 
  Lock, 
  Unlock, 
  Settings, 
  Eye, 
  EyeOff, 
  X, 
  ArrowRight,
  Globe,
  Shield,
  Search,
  Filter
} from "lucide-react";

// Apple-style Workspace Card Component
const WorkspaceCard = ({ roomId, roomName, isPublic, onStateChange, onJoin, owner, currentUserId, setRooms, rooms }) => {
  const [changeRoomId, setChangeRoomId] = useState(null);
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleStateChange = async (roomId, isPublic) => {
    if (isPublic) {
      setChangeRoomId(roomId);
      setChangePasswordModal(true);
    } else {
      const room = {
        is_private: false,
        password: ''
      };
      updateRoom(roomId, room);
    }
  };

  const handleJoin = () => {
    onJoin(roomId);
  };

  const updateRoom = async (roomId, room) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      setRooms(rooms.map(r => r._id === roomId ? { ...r, ...room } : r));
    } catch (error) {
      console.error('There was an error!', error);
    }
  };

  const handleChangePasswordSubmit = () => {
    const room = {
      is_private: true,
      password: password
    };
    updateRoom(changeRoomId, room);
    setChangePasswordModal(false);
    setPassword('');
  };

  return (
    <>
      <div className="group bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 hover:shadow-lg transition-all duration-300">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-medium text-gray-900 mb-1">{roomName}</h3>
            <div className="flex items-center space-x-2">
              {isPublic ? (
                <div className="flex items-center space-x-1 text-green-600">
                  <Globe className="w-4 h-4" />
                  <span className="text-sm font-medium">Public</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-orange-600">
                  <Lock className="w-4 h-4" />
                  <span className="text-sm font-medium">Private</span>
                </div>
              )}
            </div>
          </div>
          
          {currentUserId === owner && (
            <button
              onClick={() => handleStateChange(roomId, isPublic)}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all duration-200"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleJoin}
            className="group/btn w-full flex items-center justify-center space-x-2 px-4 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium"
          >
            <span>Join Workspace</span>
            <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
          </button>
          
          {currentUserId === owner && (
            <button
              onClick={() => handleStateChange(roomId, isPublic)}
              className="w-full px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-all duration-200 text-sm font-medium"
            >
              Change to {isPublic ? "Private" : "Public"}
            </button>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      {changePasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div 
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => setChangePasswordModal(false)}
          ></div>
          
          <div className="relative bg-white rounded-3xl shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-medium text-gray-900">Set Password</h2>
              <button
                onClick={() => setChangePasswordModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="changePassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Workspace Password
                </label>
                <div className="relative">
                  <input
                    id="changePassword"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleChangePasswordSubmit}
                  disabled={!password.trim()}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Set Password
                </button>
                <button
                  onClick={() => setChangePasswordModal(false)}
                  className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const Nodesly = () => {
  const history = useHistory(); // Agregar useHistory para navegación
  const [rooms, setRooms] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState('public');
  const [password, setPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinRoomId, setJoinRoomId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showJoinPassword, setShowJoinPassword] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Simulate API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock data
        const mockRooms = [
          {
            _id: "1",
            name: "Development Team",
            is_private: false,
            password: "",
            owner: "user1"
          },
          {
            _id: "2", 
            name: "Production Environment",
            is_private: true,
            password: "secure123",
            owner: "user1"
          },
          {
            _id: "3",
            name: "Testing Lab",
            is_private: false,
            password: "",
            owner: "user2"
          }
        ];
        
        setRooms(mockRooms);
        setCurrentUserId("user1");
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const createRoom = async (room) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const newRoom = {
        _id: Date.now().toString(),
        ...room
      };
      
      return newRoom;
    } catch (error) {
      console.error('There was an error!', error);
      return null;
    }
  };

  const handleCreateRoom = async () => {
    setLoading(true);
    try {
      const room = {
        name: roomName,
        is_private: isPrivate === 'private',
        password: password,
        owner: currentUserId
      };
      
      const newRoom = await createRoom(room);
      if (newRoom) {
        setRooms([...rooms, newRoom]);
        setOpenModal(false);
        setRoomName('');
        setPassword('');
        setIsPrivate('public');
      }
    } catch (error) {
      console.error('Error creating room:', error);
    } finally {
      setLoading(false);
    }
  };

  // Función actualizada para manejar la navegación al workspace
  const handleJoinRoom = (roomId, isPublic) => {
    if (isPublic) {
      // Navegar directamente al room para workspaces públicos
      history.push(`/room/${roomId}`);
    } else {
      // Para workspaces privados, mostrar modal de contraseña
      setJoinRoomId(roomId);
      setPasswordModal(true);
    }
  };

  // Función actualizada para manejar la contraseña y navegar
  const handlePasswordSubmit = () => {
    const room = rooms.find(room => room._id === joinRoomId);
    if (room && room.password === joinPassword) {
      // Navegar al room después de contraseña correcta
      history.push(`/room/${joinRoomId}`);
      setPasswordModal(false);
      setJoinPassword('');
    } else {
      alert('Incorrect password');
    }
  };

  const filteredRooms = rooms.filter(room =>
    room.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const publicRooms = filteredRooms.filter(room => !room.is_private);
  const privateRooms = filteredRooms.filter(room => room.is_private);

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-light text-gray-900 mb-2">Workspaces</h1>
            <p className="text-gray-600">Collaborate with your team in shared environments</p>
          </div>
          <button
            onClick={() => setOpenModal(true)}
            className="group flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium shadow-sm hover:shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Create Workspace</span>
          </button>
        </div>

        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search workspaces..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-3 w-full border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Public Workspaces */}
            {publicRooms.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Globe className="w-5 h-5 text-green-600" />
                  <h2 className="text-xl font-medium text-gray-900">Public Workspaces</h2>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    {publicRooms.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {publicRooms.map((room) => (
                    <WorkspaceCard
                      key={room._id}
                      roomId={room._id}
                      roomName={room.name}
                      isPublic={!room.is_private}
                      owner={room.owner}
                      currentUserId={currentUserId}
                      onJoin={() => handleJoinRoom(room._id, !room.is_private)}
                      setRooms={setRooms}
                      rooms={rooms}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Private Workspaces */}
            {privateRooms.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Lock className="w-5 h-5 text-orange-600" />
                  <h2 className="text-xl font-medium text-gray-900">Private Workspaces</h2>
                  <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                    {privateRooms.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {privateRooms.map((room) => (
                    <WorkspaceCard
                      key={room._id}
                      roomId={room._id}
                      roomName={room.name}
                      isPublic={!room.is_private}
                      owner={room.owner}
                      currentUserId={currentUserId}
                      onJoin={() => handleJoinRoom(room._id, !room.is_private)}
                      setRooms={setRooms}
                      rooms={rooms}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredRooms.length === 0 && (
              <div className="text-center py-20">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm ? "No workspaces found" : "No workspaces yet"}
                </h3>
                <p className="text-gray-600 mb-6">
                  {searchTerm 
                    ? "Try adjusting your search criteria"
                    : "Create your first workspace to start collaborating"
                  }
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => setOpenModal(true)}
                    className="px-6 py-3 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium"
                  >
                    Create Workspace
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Workspace Modal */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div 
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => setOpenModal(false)}
          ></div>
          
          <div className="relative bg-white rounded-3xl shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-medium text-gray-900">Create Workspace</h2>
              <button
                onClick={() => setOpenModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="workspaceName" className="block text-sm font-medium text-gray-700 mb-2">
                  Workspace Name
                </label>
                <input
                  id="workspaceName"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                  placeholder="My Awesome Workspace"
                />
              </div>

              <div>
                <label htmlFor="privacy" className="block text-sm font-medium text-gray-700 mb-2">
                  Privacy
                </label>
                <select
                  id="privacy"
                  value={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                >
                  <option value="public">Public - Anyone can join</option>
                  <option value="private">Private - Password required</option>
                </select>
              </div>

              {isPrivate === 'private' && (
                <div>
                  <label htmlFor="workspacePassword" className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="workspacePassword"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                      placeholder="Enter workspace password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={handleCreateRoom}
                  disabled={!roomName.trim() || (isPrivate === 'private' && !password.trim()) || loading}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    "Create Workspace"
                  )}
                </button>
                <button
                  onClick={() => setOpenModal(false)}
                  className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Join Private Workspace Modal */}
      {passwordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div 
            className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => setPasswordModal(false)}
          ></div>
          
          <div className="relative bg-white rounded-3xl shadow-xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-medium text-gray-900">Enter Password</h2>
              <button
                onClick={() => setPasswordModal(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="joinPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Workspace Password
                </label>
                <div className="relative">
                  <input
                    id="joinPassword"
                    type={showJoinPassword ? "text" : "password"}
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all duration-200"
                    placeholder="Enter password to join"
                  />
                  <button
                    type="button"
                    onClick={() => setShowJoinPassword(!showJoinPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showJoinPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handlePasswordSubmit}
                  disabled={!joinPassword.trim()}
                  className="flex-1 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join Workspace
                </button>
                <button
                  onClick={() => {
                    setPasswordModal(false);
                    setJoinPassword('');
                  }}
                  className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all duration-200 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};