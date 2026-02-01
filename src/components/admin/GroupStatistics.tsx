import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, BarChart3, TrendingUp, MessageSquare } from "lucide-react";

interface KeywordStat {
  keyword: string;
  count: number;
}

interface GroupStat {
  group_id: number;
  group_name: string;
  count: number;
}

interface AccountGroup {
  phone_number: string;
  groups: { group_id: number; group_name: string }[];
}

export default function GroupStatistics() {
  const [keywordStats, setKeywordStats] = useState<KeywordStat[]>([]);
  const [groupStats, setGroupStats] = useState<GroupStat[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalHits, setTotalHits] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Kalit so'z statistikasi
      const { data: hits } = await supabase
        .from("keyword_hits")
        .select("keyword_id, group_id, group_name, keywords(keyword)")
        .order("created_at", { ascending: false });

      if (hits) {
        setTotalHits(hits.length);

        // Kalit so'z bo'yicha guruhlash
        const keywordCounts: Record<string, number> = {};
        const groupCounts: Record<string, { name: string; count: number }> = {};

        hits.forEach((hit: any) => {
          const keyword = hit.keywords?.keyword || "Noma'lum";
          keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;

          const groupKey = String(hit.group_id);
          if (!groupCounts[groupKey]) {
            groupCounts[groupKey] = { name: hit.group_name || "Noma'lum", count: 0 };
          }
          groupCounts[groupKey].count++;
        });

        setKeywordStats(
          Object.entries(keywordCounts)
            .map(([keyword, count]) => ({ keyword, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
        );

        setGroupStats(
          Object.entries(groupCounts)
            .map(([group_id, data]) => ({
              group_id: parseInt(group_id),
              group_name: data.name,
              count: data.count
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
        );
      }

      // Akkaunt-guruh bog'liqligi
      const { data: accGroups } = await supabase
        .from("account_groups")
        .select("phone_number, group_id, group_name")
        .order("phone_number");

      if (accGroups) {
        const grouped: Record<string, { group_id: number; group_name: string }[]> = {};
        accGroups.forEach((ag: any) => {
          if (!grouped[ag.phone_number]) {
            grouped[ag.phone_number] = [];
          }
          grouped[ag.phone_number].push({
            group_id: ag.group_id,
            group_name: ag.group_name || "Noma'lum"
          });
        });

        setAccountGroups(
          Object.entries(grouped).map(([phone_number, groups]) => ({
            phone_number,
            groups
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching statistics:", error);
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
    <div className="space-y-6 mb-8">
      {/* Umumiy statistika */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-taxi-yellow flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Monitoring Statistikasi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-800 rounded-lg p-4 text-center">
              <MessageSquare className="h-8 w-8 text-taxi-yellow mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{totalHits}</p>
              <p className="text-sm text-zinc-400">Jami topilgan xabarlar</p>
            </div>
            <div className="bg-zinc-800 rounded-lg p-4 text-center">
              <TrendingUp className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{keywordStats.length}</p>
              <p className="text-sm text-zinc-400">Faol kalit so'zlar</p>
            </div>
            <div className="bg-zinc-800 rounded-lg p-4 text-center">
              <BarChart3 className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{groupStats.length}</p>
              <p className="text-sm text-zinc-400">Faol guruhlar</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top guruhlar */}
      {groupStats.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-lg">🔥 Eng faol guruhlar</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400">#</TableHead>
                  <TableHead className="text-zinc-400">Guruh nomi</TableHead>
                  <TableHead className="text-zinc-400 text-right">Topilgan xabarlar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupStats.map((stat, index) => (
                  <TableRow key={stat.group_id} className="border-zinc-800">
                    <TableCell className="text-zinc-400">{index + 1}</TableCell>
                    <TableCell className="text-white">{stat.group_name}</TableCell>
                    <TableCell className="text-right">
                      <Badge className="bg-taxi-yellow text-black">{stat.count}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Kalit so'z statistikasi */}
      {keywordStats.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-lg">🔑 Kalit so'zlar bo'yicha</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {keywordStats.map((stat) => (
                <div
                  key={stat.keyword}
                  className="bg-zinc-800 rounded-lg px-4 py-2 flex items-center gap-2"
                >
                  <span className="text-white">{stat.keyword}</span>
                  <Badge className="bg-green-600">{stat.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Akkaunt-guruh bog'liqligi */}
      {accountGroups.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-lg">📱 Akkauntlar va guruhlar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {accountGroups.map((account) => (
                <div key={account.phone_number} className="bg-zinc-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className="bg-taxi-yellow text-black">{account.phone_number}</Badge>
                    <span className="text-zinc-400 text-sm">
                      {account.groups.length} ta guruh
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {account.groups.slice(0, 10).map((group) => (
                      <Badge
                        key={group.group_id}
                        variant="outline"
                        className="border-zinc-600 text-zinc-300 text-xs"
                      >
                        {group.group_name.length > 25
                          ? group.group_name.slice(0, 25) + "..."
                          : group.group_name}
                      </Badge>
                    ))}
                    {account.groups.length > 10 && (
                      <Badge variant="secondary" className="bg-zinc-700 text-zinc-300">
                        +{account.groups.length - 10} ta
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {totalHits === 0 && (
        <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 text-center">
          <p className="text-blue-400">
            📊 Hali statistika yo'q. Bot ishlaganda ma'lumotlar to'planadi.
          </p>
        </div>
      )}
    </div>
  );
}
