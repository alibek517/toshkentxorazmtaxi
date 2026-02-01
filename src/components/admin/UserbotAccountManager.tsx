import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Smartphone, CheckCircle, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

interface UserbotAccount {
  id: string;
  phone_number: string;
  status: string;
  two_fa_required: boolean | null;
  created_at: string;
  updated_at: string;
}

export default function UserbotAccountManager() {
  const [accounts, setAccounts] = useState<UserbotAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("userbot_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async () => {
    if (!newPhone.trim()) {
      toast.error("Telefon raqamini kiriting");
      return;
    }

    // Normalize phone number
    let phone = newPhone.trim().replace(/\s+/g, "");
    if (!phone.startsWith("+")) {
      phone = "+" + phone;
    }

    setAddingAccount(true);
    try {
      const { error } = await supabase
        .from("userbot_accounts")
        .insert({
          phone_number: phone,
          status: "pending",
        });

      if (error) {
        if (error.code === "23505") {
          toast.error("Bu raqam allaqachon qo'shilgan");
        } else {
          throw error;
        }
      } else {
        toast.success("Raqam qo'shildi! Endi VPS'da UserBot'ni shu raqam bilan ishga tushiring.");
        setNewPhone("");
        fetchAccounts();
      }
    } catch (error: any) {
      console.error("Error adding account:", error);
      toast.error(error.message || "Xatolik yuz berdi");
    } finally {
      setAddingAccount(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from("userbot_accounts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Akkaunt o'chirildi");
      fetchAccounts();
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error("Xatolik yuz berdi");
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Faol
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-600/20 text-yellow-500 border-yellow-600">
            <Clock className="h-3 w-3 mr-1" />
            Kutilmoqda
          </Badge>
        );
      default:
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800 mb-8">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-taxi-yellow" />
        </CardContent>
      </Card>
    );
  }

  const activeAccounts = accounts.filter(a => a.status === "active");
  const pendingAccounts = accounts.filter(a => a.status === "pending");

  return (
    <Card className="bg-zinc-900 border-zinc-800 mb-8">
      <CardHeader>
        <CardTitle className="text-taxi-yellow flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          UserBot Akkauntlar
          {activeAccounts.length > 0 && (
            <Badge className="bg-green-600 ml-2">
              {activeAccounts.length} faol
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Add new account form */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <Input
            placeholder="Telefon raqami (masalan: +998901234567)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddAccount()}
            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
          />
          <Button
            onClick={handleAddAccount}
            disabled={addingAccount || !newPhone.trim()}
            className="bg-taxi-yellow text-black hover:bg-taxi-yellow/90 shrink-0"
          >
            {addingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Qo'shish
          </Button>
        </div>

        {/* Instructions */}
        <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mb-6">
          <h4 className="text-blue-400 font-medium mb-2">📱 Qanday ishga tushirish?</h4>
          <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
            <li>Yuqoridagi formaga telefon raqamini kiriting</li>
            <li>VPS serverda <code className="bg-zinc-800 px-1 rounded">userbot/</code> papkasiga o'ting</li>
            <li><code className="bg-zinc-800 px-1 rounded">.env</code> faylida <code className="bg-zinc-800 px-1 rounded">PHONE_NUMBER</code>'ni shu raqamga o'zgartiring</li>
            <li><code className="bg-zinc-800 px-1 rounded">python main.py</code> ni ishga tushiring</li>
            <li>Telegram'ga kelgan kodni kiriting</li>
          </ol>
        </div>

        {/* Accounts list */}
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800">
              <TableHead className="text-zinc-400">Telefon raqami</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-zinc-400">2FA</TableHead>
              <TableHead className="text-zinc-400">Qo'shilgan</TableHead>
              <TableHead className="text-zinc-400 text-right">Amallar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id} className="border-zinc-800">
                <TableCell className="text-white font-mono">{account.phone_number}</TableCell>
                <TableCell>{getStatusBadge(account.status)}</TableCell>
                <TableCell className="text-zinc-400">
                  {account.two_fa_required ? "Ha" : "Yo'q"}
                </TableCell>
                <TableCell className="text-zinc-400">
                  {new Date(account.created_at).toLocaleDateString("uz-UZ")}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteAccount(account.id)}
                    disabled={deletingId === account.id}
                    className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                  >
                    {deletingId === account.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500">
                  Hali akkauntlar yo'q
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pending notice */}
        {pendingAccounts.length > 0 && (
          <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg">
            <p className="text-yellow-400 text-sm">
              ⏳ {pendingAccounts.length} ta akkaunt hali faollashtirilmagan. 
              VPS'da UserBot'ni ishga tushiring.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
