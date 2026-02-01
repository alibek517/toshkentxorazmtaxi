import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Users, Package, Car, Clock, CheckCircle, XCircle, LogOut, MessageCircle, Settings, Eye, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import UserBotManager from "@/components/admin/UserBotManager";
import UserbotAccountManager from "@/components/admin/UserbotAccountManager";
import GroupStatistics from "@/components/admin/GroupStatistics";

interface Stats {
  totalUsers: number;
  totalOrders: number;
  taxiOrders: number;
  parcelOrders: number;
  pendingOrders: number;
  acceptedOrders: number;
}

interface Order {
  id: string;
  order_type: string;
  message_text: string;
  status: string;
  created_at: string;
}

interface BotUser {
  id: string;
  telegram_id: number;
  full_name: string | null;
  username: string | null;
  phone_number: string | null;
  is_admin: boolean;
  is_blocked: boolean;
  created_at: string;
}

interface WatchedGroup {
  id: string;
  group_id: number;
  group_name: string | null;
  created_at: string;
}

interface Keyword {
  id: string;
  keyword: string;
  created_at: string;
}

const BOT_USERNAME = "@ToshkentXorazm_TaxiBot";
const BOT_URL = "https://t.me/ToshkentXorazm_TaxiBot";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalOrders: 0,
    taxiOrders: 0,
    parcelOrders: 0,
    pendingOrders: 0,
    acceptedOrders: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<BotUser[]>([]);
  const [watchedGroups, setWatchedGroups] = useState<WatchedGroup[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverRegistrationEnabled, setDriverRegistrationEnabled] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  
  // New group form
  const [newGroupId, setNewGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  
  // New keyword form
  const [newKeyword, setNewKeyword] = useState("");
  const [addingKeyword, setAddingKeyword] = useState(false);

  useEffect(() => {
    // Check auth
    const isAuth = sessionStorage.getItem("admin_auth");
    if (!isAuth) {
      navigate("/admin/login");
      return;
    }
    fetchData();
    fetchSettings();
    fetchWatchedGroups();
    fetchKeywords();
  }, [navigate]);

  const fetchWatchedGroups = async () => {
    const { data } = await supabase
      .from("watched_groups")
      .select("*")
      .order("created_at", { ascending: false });
    setWatchedGroups(data || []);
  };

  const fetchKeywords = async () => {
    const { data } = await supabase
      .from("keywords")
      .select("*")
      .order("created_at", { ascending: false });
    setKeywords(data || []);
  };

  const handleAddGroup = async () => {
    const groupId = parseInt(newGroupId);
    if (isNaN(groupId)) {
      toast.error("Noto'g'ri guruh ID");
      return;
    }
    
    setAddingGroup(true);
    try {
      const { error } = await supabase
        .from("watched_groups")
        .insert({ 
          group_id: groupId, 
          group_name: newGroupName || null 
        });
      
      if (error) throw error;
      
      toast.success("Guruh qo'shildi!");
      setNewGroupId("");
      setNewGroupName("");
      fetchWatchedGroups();
    } catch (error: any) {
      console.error("Error adding group:", error);
      toast.error(error.message || "Xatolik yuz berdi");
    } finally {
      setAddingGroup(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      const { error } = await supabase
        .from("watched_groups")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      
      toast.success("Guruh o'chirildi!");
      fetchWatchedGroups();
    } catch (error) {
      console.error("Error deleting group:", error);
      toast.error("Xatolik yuz berdi");
    }
  };

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) {
      toast.error("Kalit so'z kiriting");
      return;
    }
    
    setAddingKeyword(true);
    try {
      const { error } = await supabase
        .from("keywords")
        .insert({ keyword: newKeyword.trim() });
      
      if (error) throw error;
      
      toast.success("Kalit so'z qo'shildi!");
      setNewKeyword("");
      fetchKeywords();
    } catch (error: any) {
      console.error("Error adding keyword:", error);
      toast.error(error.message || "Xatolik yuz berdi");
    } finally {
      setAddingKeyword(false);
    }
  };

  const handleDeleteKeyword = async (id: string) => {
    try {
      const { error } = await supabase
        .from("keywords")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      
      toast.success("Kalit so'z o'chirildi!");
      fetchKeywords();
    } catch (error) {
      console.error("Error deleting keyword:", error);
      toast.error("Xatolik yuz berdi");
    }
  };

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("bot_settings")
      .select("*")
      .eq("setting_key", "driver_registration_enabled")
      .single();
    
    if (data) {
      setDriverRegistrationEnabled(data.setting_value === "true");
    }
  };

  const handleToggleDriverRegistration = async (enabled: boolean) => {
    setSettingsLoading(true);
    try {
      const { error } = await supabase
        .from("bot_settings")
        .update({ setting_value: enabled ? "true" : "false" })
        .eq("setting_key", "driver_registration_enabled");
      
      if (error) throw error;
      
      setDriverRegistrationEnabled(enabled);
      toast.success(enabled ? "Haydovchi ro'yxati yoqildi" : "Haydovchi ro'yxati o'chirildi");
    } catch (error) {
      console.error("Error updating setting:", error);
      toast.error("Xatolik yuz berdi");
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_auth");
    navigate("/admin/login");
  };

  const fetchData = async () => {
    try {
      // Fetch users count
      const { count: usersCount } = await supabase
        .from("bot_users")
        .select("*", { count: "exact", head: true });

      // Fetch orders
      const { data: ordersData } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      const orders = ordersData || [];
      
      // Calculate stats
      const taxiOrders = orders.filter(o => o.order_type === "taxi").length;
      const parcelOrders = orders.filter(o => o.order_type === "parcel").length;
      const pendingOrders = orders.filter(o => o.status === "pending").length;
      const acceptedOrders = orders.filter(o => o.status === "accepted").length;

      setStats({
        totalUsers: usersCount || 0,
        totalOrders: orders.length,
        taxiOrders,
        parcelOrders,
        pendingOrders,
        acceptedOrders,
      });

      setRecentOrders(orders.slice(0, 10));

      // Fetch users
      const { data: usersData } = await supabase
        .from("bot_users")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      setUsers(usersData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-taxi-dark flex items-center justify-center">
        <div className="text-taxi-yellow text-xl">Yuklanmoqda...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-taxi-dark p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h1 className="text-3xl font-bold text-taxi-yellow">
            🚕 Admin Dashboard
          </h1>
          <div className="flex items-center gap-3">
            <a 
              href={BOT_URL} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              {BOT_USERNAME}
            </a>
            <Button 
              variant="outline" 
              className="border-zinc-700 text-zinc-400 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Chiqish
            </Button>
          </div>
        </div>

        {/* Settings Card */}
        <Card className="bg-zinc-900 border-zinc-800 mb-8">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-taxi-yellow flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Sozlamalar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="driver-toggle" className="text-white font-medium">
                  🚖 Haydovchi Bo'lish
                </Label>
                <p className="text-sm text-zinc-400">
                  {driverRegistrationEnabled 
                    ? "Haydovchi ro'yxatdan o'tish yoqilgan" 
                    : "Haydovchi ro'yxatdan o'tish o'chirilgan - faqat taxi zakaz va pochta ko'rinadi"}
                </p>
              </div>
              <Switch
                id="driver-toggle"
                checked={driverRegistrationEnabled}
                onCheckedChange={handleToggleDriverRegistration}
                disabled={settingsLoading}
                className="data-[state=checked]:bg-taxi-yellow"
              />
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                Jami Foydalanuvchilar
              </CardTitle>
              <Users className="h-4 w-4 text-taxi-yellow" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats.totalUsers}</div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                Taxi Zakazlar
              </CardTitle>
              <Car className="h-4 w-4 text-taxi-yellow" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats.taxiOrders}</div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                Pochta Zakazlar
              </CardTitle>
              <Package className="h-4 w-4 text-taxi-yellow" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats.parcelOrders}</div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                Kutilmoqda
              </CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{stats.pendingOrders}</div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                Qabul qilingan
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{stats.acceptedOrders}</div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                Jami Zakazlar
              </CardTitle>
              <Package className="h-4 w-4 text-taxi-yellow" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats.totalOrders}</div>
            </CardContent>
          </Card>
        </div>

        {/* Watched Groups */}
        <Card className="bg-zinc-900 border-zinc-800 mb-8">
          <CardHeader>
            <CardTitle className="text-taxi-yellow flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Kuzatiladigan Guruhlar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Add new group form */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Input
                placeholder="Guruh ID (masalan: -1001234567890)"
                value={newGroupId}
                onChange={(e) => setNewGroupId(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
              <Input
                placeholder="Guruh nomi (ixtiyoriy)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
              <Button 
                onClick={handleAddGroup}
                disabled={addingGroup || !newGroupId}
                className="bg-taxi-yellow text-black hover:bg-taxi-yellow/90 shrink-0"
              >
                {addingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Qo'shish
              </Button>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400">Guruh ID</TableHead>
                  <TableHead className="text-zinc-400">Nomi</TableHead>
                  <TableHead className="text-zinc-400">Qo'shilgan</TableHead>
                  <TableHead className="text-zinc-400 text-right">Amallar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {watchedGroups.map((group) => (
                  <TableRow key={group.id} className="border-zinc-800">
                    <TableCell className="text-white font-mono">{group.group_id}</TableCell>
                    <TableCell className="text-zinc-300">{group.group_name || "-"}</TableCell>
                    <TableCell className="text-zinc-400">
                      {new Date(group.created_at).toLocaleDateString("uz-UZ")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteGroup(group.id)}
                        className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {watchedGroups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-zinc-500">
                      Hali guruhlar yo'q
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Group Statistics */}
        <GroupStatistics />

        {/* UserBot Accounts */}
        <UserbotAccountManager />

        {/* UserBot Manager - Group Monitoring */}
        <UserBotManager />

        {/* Keywords */}
        <Card className="bg-zinc-900 border-zinc-800 mb-8">
          <CardHeader>
            <CardTitle className="text-taxi-yellow flex items-center gap-2">
              🔑 Kalit So'zlar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Add new keyword form */}
            <div className="flex gap-3 mb-6">
              <Input
                placeholder="Yangi kalit so'z"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
              <Button 
                onClick={handleAddKeyword}
                disabled={addingKeyword || !newKeyword.trim()}
                className="bg-taxi-yellow text-black hover:bg-taxi-yellow/90 shrink-0"
              >
                {addingKeyword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Qo'shish
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {keywords.map((kw) => (
                <Badge 
                  key={kw.id} 
                  variant="secondary"
                  className="bg-zinc-800 text-white px-3 py-1.5 flex items-center gap-2"
                >
                  {kw.keyword}
                  <button 
                    onClick={() => handleDeleteKeyword(kw.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              ))}
              {keywords.length === 0 && (
                <p className="text-zinc-500">Hali kalit so'zlar yo'q</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="bg-zinc-900 border-zinc-800 mb-8">
          <CardHeader>
            <CardTitle className="text-taxi-yellow">So'nggi Zakazlar</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400">Turi</TableHead>
                  <TableHead className="text-zinc-400">Xabar</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Sana</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id} className="border-zinc-800">
                    <TableCell>
                      <Badge variant={order.order_type === "taxi" ? "default" : "secondary"}>
                        {order.order_type === "taxi" ? "🚕 Taxi" : "📦 Pochta"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-white max-w-xs truncate">
                      {order.message_text}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={order.status === "accepted" ? "default" : "outline"}
                        className={order.status === "accepted" ? "bg-green-600" : "text-orange-500 border-orange-500"}
                      >
                        {order.status === "accepted" ? "✅ Qabul" : "⏳ Kutilmoqda"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {new Date(order.created_at).toLocaleString("uz-UZ")}
                    </TableCell>
                  </TableRow>
                ))}
                {recentOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-zinc-500">
                      Hali zakazlar yo'q
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Users List */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-taxi-yellow">Foydalanuvchilar</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400">Ism</TableHead>
                  <TableHead className="text-zinc-400">Username</TableHead>
                  <TableHead className="text-zinc-400">Telefon</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Ro'yxatdan o'tgan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="border-zinc-800">
                    <TableCell className="text-white">{user.full_name || "-"}</TableCell>
                    <TableCell className="text-zinc-400">
                      {user.username ? `@${user.username}` : "-"}
                    </TableCell>
                    <TableCell className="text-zinc-400">{user.phone_number || "-"}</TableCell>
                    <TableCell>
                      {user.is_blocked ? (
                        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                          <XCircle className="h-3 w-3" /> Bloklangan
                        </Badge>
                      ) : user.is_admin ? (
                        <Badge className="bg-taxi-yellow text-black">Admin</Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-500 border-green-500">
                          Faol
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {new Date(user.created_at).toLocaleDateString("uz-UZ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
