import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Package, Car, Clock, CheckCircle, XCircle } from "lucide-react";

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

export default function AdminDashboard() {
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

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
        <h1 className="text-3xl font-bold text-taxi-yellow mb-8">
          🚕 Admin Dashboard
        </h1>

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
