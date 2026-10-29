import { connection } from "next/server";
import { getCachedUser } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/utils/supabase/admin";
import DashboardOverviewClient from "@/components/dashboard/DashboardOverviewClient";
import { 
  fetchActiveShift, 
  fetchUserRecentRoutes, 
  fetchActiveFieldDevices, 
  fetchDashboardTargetsProgress,
  fetchExactTerritoryDistribution,
  fetchFieldOperationsTimeline,
  fetchWeeklyProgressData,
  fetchDailyPriorities 
} from "@/app/dashboard/actions";

export const instant = false;

export default async function DashboardPage() {
  await connection();
  const user = await getCachedUser();

  const userRole = (user?.user_metadata?.role || 'staff').toLowerCase();
  const isManagement = ['admin', 'manager'].includes(userRole);

  // Run all primary dashboard metrics in parallel
  const [
    managementCounts,
    userCounts,
    activeShiftRes,
    recentRoutesRes,
    activeFieldDevicesRes,
    targetProgressRes,
    territoryDistributionRes,
    fieldActivitiesRes,
    weeklyProgressRes,
    dailyPrioritiesRes
  ] = await Promise.all([
    // Management stats
    isManagement
      ? Promise.all([
          Promise.resolve(supabaseAdmin.auth.admin.listUsers()).then(res => res.data?.users?.length || 0).catch(() => 0),
          Promise.resolve(supabaseAdmin.from('retailers').select('id', { count: 'exact', head: true })).then(res => res.count || 0).catch(() => 0),
          Promise.resolve(supabaseAdmin.from('sales_records').select('amount', { count: 'exact' }).limit(1000)).then((res: any) => {
            const count = res.count || 0;
            const rev = (res.data || []).reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
            return { count, rev };
          }).catch(() => ({ count: 0, rev: 0 }))
        ] as const)
      : Promise.resolve([0, 0, { count: 0, rev: 0 }] as const),

    // User-specific stats
    !isManagement && user?.id
      ? Promise.all([
          Promise.resolve(supabaseAdmin.from('retailer_visits').select('id', { count: 'exact', head: true }).eq('sales_person_id', user.id)).then(res => res.count || 0).catch(() => 0),
          Promise.resolve(supabaseAdmin.from('retailers').select('id', { count: 'exact', head: true }).eq('sales_person_id', user.id)).then(res => res.count || 0).catch(() => 0),
          Promise.resolve(supabaseAdmin.from('sales_records').select('amount', { count: 'exact' }).eq('sales_person_id', user.id).limit(1000)).then((res: any) => {
            const count = res.count || 0;
            const rev = (res.data || []).reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
            return { count, rev };
          }).catch(() => ({ count: 0, rev: 0 }))
        ] as const)
      : Promise.resolve([0, 0, { count: 0, rev: 0 }] as const),

    // Dashboard widgets
    fetchActiveShift().catch(() => null),
    fetchUserRecentRoutes().catch(() => []),
    fetchActiveFieldDevices().catch(() => []),
    fetchDashboardTargetsProgress().catch(() => null),
    fetchExactTerritoryDistribution().catch(() => []),
    fetchFieldOperationsTimeline().catch(() => []),
    fetchWeeklyProgressData().catch(() => null),
    fetchDailyPriorities().catch(() => ({
      tasks: [],
      targets: { min_shift_hours: 6, target_visits: 5, target_orders: 3, target_distance_km: 15 },
      todayShift: null
    }))
  ]);

  const staffCount = isManagement ? managementCounts[0] : userCounts[0];
  const retailerCount = isManagement ? managementCounts[1] : userCounts[1];
  const salesCount = isManagement ? managementCounts[2].count : userCounts[2].count;
  const totalRevenue = isManagement ? managementCounts[2].rev : userCounts[2].rev;

  const activeShift = activeShiftRes;
  const recentRoutes = recentRoutesRes;
  const activeFieldDevices = activeFieldDevicesRes;
  const targetProgress = targetProgressRes;
  const territoryDistribution = territoryDistributionRes;
  const fieldActivities = fieldActivitiesRes;
  const weeklyProgress = weeklyProgressRes;
  const dailyPrioritiesData = dailyPrioritiesRes;

  const stats = {
    staffCount,
    retailerCount,
    salesCount,
    totalRevenue,
    userId: user?.id,
    userName: user?.user_metadata?.name || user?.email?.split('@')[0] || 'Ledo Valley HQ',
    userRole: user?.user_metadata?.role || 'Staff',
    userDistrict: user?.user_metadata?.district || user?.user_metadata?.territory || 'Dibrugarh'
  };

  return (
    <DashboardOverviewClient 
      stats={stats} 
      initialActiveShift={activeShift} 
      initialRecentRoutes={recentRoutes}
      initialActiveDevices={activeFieldDevices}
      initialTargetProgress={targetProgress}
      initialTerritoryDistribution={territoryDistribution}
      initialFieldActivities={fieldActivities}
      initialWeeklyProgress={weeklyProgress}
      initialDailyTasks={dailyPrioritiesData.tasks}
      initialDailyTargets={dailyPrioritiesData.targets}
      initialTodayShift={dailyPrioritiesData.todayShift}
    />
  );
}
