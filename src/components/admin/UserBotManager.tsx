import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Phone, Key, Shield, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface UserBotAccount {
  id: string;
  phone_number: string;
  status: string;
  session_string: string | null;
  two_fa_required: boolean | null;
  created_at: string;
}

export default function UserBotManager() {
  const [accounts, setAccounts] = useState<UserBotAccount[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Auth flow state
  const [step, setStep] = useState<"idle" | "phone" | "code" | "2fa">("idle");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [twoFaPassword, setTwoFaPassword] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const { data } = await supabase
        .from("userbot_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      setAccounts(data || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  const callUserBotAuth = async (action: string, payload: any) => {
    const response = await supabase.functions.invoke("userbot-auth", {
      body: { action, ...payload },
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    
    return response.data;
  };

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Telefon raqamini kiriting");
      return;
    }

    setSubmitting(true);
    try {
      const result = await callUserBotAuth("send_code", { phone_number: phoneNumber });
      
      if (result.ok) {
        setPhoneCodeHash(result.phone_code_hash);
        setStep("code");
        toast.success("Kod yuborildi! Telegram ilovasida tekshiring.");
      } else {
        toast.error(result.error || "Xatolik yuz berdi");
      }
    } catch (error: any) {
      console.error("Send code error:", error);
      toast.error(error.message || "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      toast.error("Kodni kiriting");
      return;
    }

    setSubmitting(true);
    try {
      const result = await callUserBotAuth("verify_code", {
        phone_number: phoneNumber,
        code: verificationCode,
        phone_code_hash: phoneCodeHash,
      });

      if (result.ok) {
        if (result.needs_2fa) {
          setStep("2fa");
          toast.info("Ikki bosqichli tasdiqlash kerak");
        } else {
          toast.success("Muvaffaqiyatli ulandi!");
          resetForm();
          fetchAccounts();
        }
      } else {
        toast.error(result.error || "Kod noto'g'ri");
      }
    } catch (error: any) {
      console.error("Verify code error:", error);
      toast.error(error.message || "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!twoFaPassword.trim()) {
      toast.error("Parolni kiriting");
      return;
    }

    setSubmitting(true);
    try {
      const result = await callUserBotAuth("verify_2fa", {
        phone_number: phoneNumber,
        password: twoFaPassword,
      });

      if (result.ok) {
        toast.success("Muvaffaqiyatli ulandi!");
        resetForm();
        fetchAccounts();
      } else {
        toast.error(result.error || "Parol noto'g'ri");
      }
    } catch (error: any) {
      console.error("2FA error:", error);
      toast.error(error.message || "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      await supabase.from("userbot_accounts").delete().eq("id", id);
      toast.success("Akkaunt o'chirildi");
      fetchAccounts();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Xatolik yuz berdi");
    }
  };

  const resetForm = () => {
    setStep("idle");
    setPhoneNumber("");
    setVerificationCode("");
    setTwoFaPassword("");
    setPhoneCodeHash("");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" /> Faol</Badge>;
      case "pending":
        return <Badge variant="outline" className="text-orange-500 border-orange-500"><AlertCircle className="h-3 w-3 mr-1" /> Kutilmoqda</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800 mb-8">
      <CardHeader>
        <CardTitle className="text-taxi-yellow flex items-center gap-2">
          <Phone className="h-5 w-5" />
          UserBot Akkauntlar
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Auth Flow */}
        {step === "idle" && (
          <Button 
            onClick={() => setStep("phone")}
            className="bg-taxi-yellow text-black hover:bg-taxi-yellow/90 mb-6"
          >
            <Plus className="h-4 w-4 mr-2" />
            Telegram Akkaunt Ulash
          </Button>
        )}

        {step === "phone" && (
          <div className="bg-zinc-800 p-4 rounded-lg mb-6 space-y-4">
            <h3 className="text-white font-medium flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Telefon raqamini kiriting
            </h3>
            <Input
              placeholder="+998901234567"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="bg-zinc-700 border-zinc-600 text-white"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSendCode}
                disabled={submitting}
                className="bg-taxi-yellow text-black hover:bg-taxi-yellow/90"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Kod yuborish
              </Button>
              <Button variant="ghost" onClick={resetForm} className="text-zinc-400">
                Bekor qilish
              </Button>
            </div>
          </div>
        )}

        {step === "code" && (
          <div className="bg-zinc-800 p-4 rounded-lg mb-6 space-y-4">
            <h3 className="text-white font-medium flex items-center gap-2">
              <Key className="h-4 w-4" />
              Tasdiqlash kodini kiriting
            </h3>
            <p className="text-sm text-zinc-400">
              Telegram ilovasida kelgan kodni kiriting (masalan: 1.2.3.4.5 yoki 12345)
            </p>
            <Input
              placeholder="1.2.3.4.5"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className="bg-zinc-700 border-zinc-600 text-white"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleVerifyCode}
                disabled={submitting}
                className="bg-taxi-yellow text-black hover:bg-taxi-yellow/90"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Tasdiqlash
              </Button>
              <Button variant="ghost" onClick={resetForm} className="text-zinc-400">
                Bekor qilish
              </Button>
            </div>
          </div>
        )}

        {step === "2fa" && (
          <div className="bg-zinc-800 p-4 rounded-lg mb-6 space-y-4">
            <h3 className="text-white font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Ikki bosqichli tasdiqlash paroli
            </h3>
            <Input
              type="password"
              placeholder="Cloud password"
              value={twoFaPassword}
              onChange={(e) => setTwoFaPassword(e.target.value)}
              className="bg-zinc-700 border-zinc-600 text-white"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleVerify2FA}
                disabled={submitting}
                className="bg-taxi-yellow text-black hover:bg-taxi-yellow/90"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Tasdiqlash
              </Button>
              <Button variant="ghost" onClick={resetForm} className="text-zinc-400">
                Bekor qilish
              </Button>
            </div>
          </div>
        )}

        {/* Accounts Table */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-taxi-yellow" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800">
                <TableHead className="text-zinc-400">Telefon</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
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
                    {new Date(account.created_at).toLocaleDateString("uz-UZ")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAccount(account.id)}
                      className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-zinc-500">
                    Hali akkauntlar yo'q
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Info */}
        <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
          <h4 className="text-blue-400 font-medium mb-2">ℹ️ Muhim ma'lumot</h4>
          <p className="text-sm text-zinc-400">
            UserBot - bu sizning shaxsiy Telegram akkauntingiz orqali guruhlardagi xabarlarni kuzatish imkonini beradi. 
            Akkauntni ulash uchun Telegram'dan kelgan tasdiqlash kodini kiriting.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
