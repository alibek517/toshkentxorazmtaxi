import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Radio, CheckCircle, Users } from "lucide-react";

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

export default function UserBotManager() {
  const [groups, setGroups] = useState<WatchedGroup[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [groupsRes, keywordsRes] = await Promise.all([
        supabase.from("watched_groups").select("*").order("created_at", { ascending: false }),
        supabase.from("keywords").select("*").order("created_at", { ascending: false }),
      ]);
      
      setGroups(groupsRes.data || []);
      setKeywords(keywordsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
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

  return (
    <Card className="bg-zinc-900 border-zinc-800 mb-8">
      <CardHeader>
        <CardTitle className="text-taxi-yellow flex items-center gap-2">
          <Radio className="h-5 w-5" />
          Guruh Monitoring
          <Badge className="bg-green-600 ml-2">
            <CheckCircle className="h-3 w-3 mr-1" /> Ishlayapti
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Status */}
        <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse"></div>
            <div>
              <h4 className="text-green-400 font-medium">Bot Monitoring Faol</h4>
              <p className="text-sm text-zinc-400">
                Guruhlardan kelgan xabarlar avtomatik tekshiriladi va kalit so'zlar topilganda haydovchilar guruhiga yuboriladi.
              </p>
            </div>
          </div>
        </div>

        {/* Watched Groups */}
        <div className="mb-6">
          <h3 className="text-white font-medium flex items-center gap-2 mb-3">
            <Users className="h-4 w-4" />
            Kuzatilayotgan Guruhlar ({groups.length})
          </h3>
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800">
                <TableHead className="text-zinc-400">Guruh nomi</TableHead>
                <TableHead className="text-zinc-400">Guruh ID</TableHead>
                <TableHead className="text-zinc-400">Qo'shilgan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id} className="border-zinc-800">
                  <TableCell className="text-white">{group.group_name || "Noma'lum"}</TableCell>
                  <TableCell className="text-zinc-400 font-mono text-sm">{group.group_id}</TableCell>
                  <TableCell className="text-zinc-400">
                    {new Date(group.created_at).toLocaleDateString("uz-UZ")}
                  </TableCell>
                </TableRow>
              ))}
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-zinc-500">
                    Guruhlar yo'q - Admin panelda qo'shing
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Keywords */}
        <div>
          <h3 className="text-white font-medium mb-3">
            Kalit so'zlar ({keywords.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <Badge key={kw.id} variant="secondary" className="bg-zinc-800 text-zinc-200">
                {kw.keyword}
              </Badge>
            ))}
            {keywords.length === 0 && (
              <p className="text-zinc-500 text-sm">Kalit so'zlar yo'q</p>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
          <h4 className="text-blue-400 font-medium mb-2">ℹ️ Qanday ishlaydi?</h4>
          <ul className="text-sm text-zinc-400 space-y-1">
            <li>• Bot kuzatilayotgan guruhlardagi har bir xabarni tekshiradi</li>
            <li>• Kalit so'z topilsa, xabar haydovchilar guruhiga yuboriladi</li>
            <li>• Xabarga to'g'ridan-to'g'ri havola qo'shiladi</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
