import { connection } from "next/server";
import { createClient } from "@/utils/supabase/server";
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userRole = (user?.user_metadata?.role || 'staff').toLowerCase();
  const isManagement = ['admin', 'manager'].includes(userRole);

  let staffCount = 0;
  let retailerCount = 0;
  let salesCount = 0;
  let totalRevenue = 0;

  if (isManagement) {
    try {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      staffCount = usersData?.users?.length || 0;
    } catch (e) {
      // fallback
    }

    try {
      const { count } = await supabaseAdmin
        .from('retailers')
        .select('id', { count: 'exact', head: true });
      retailerCount = count || 0;
    } catch (e) {
      // fallback
    }

    try {
      const { data: salesData, count } = await supabaseAdmin
        .from('sales_records')
        .select('amount', { count: 'exact' });
      salesCount = count || 0;
      if (salesData && salesData.length > 0) {
        totalRevenue = salesData.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
      }
    } catch (e) {
      // fallback
    }
  } else if (user?.id) {
    try {
      const { count: visitsCount } = await supabaseAdmin
        .from('retailer_visits')
        .select('id', { count: 'exact', head: true })
        .eq('sales_person_id', user.id);
      staffCount = visitsCount || 0;
    } catch (e) {
      // fallback
    }

    try {
      const { count: userRetailers } = await supabaseAdmin
        .from('retailers')
        .select('id', { count: 'exact', head: true })
        .eq('sales_person_id', user.id);
      retailerCount = userRetailers || 0;
    } catch (e) {
      // fallback
    }

    try {
      const { data: userSales, count: userSalesCount } = await supabaseAdmin
        .from('sales_records')
        .select('amount', { count: 'exact' })
        .eq('sales_person_id', user.id);
      salesCount = userSalesCount || 0;
      if (userSales && userSales.length > 0) {
        totalRevenue = userSales.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
      }
    } catch (e) {
      // fallback
    }
  }

  let activeShift = null;
  try {
    activeShift = await fetchActiveShift();
  } catch (e) {
    // fallback
  }

  let recentRoutes: string[] = [];
  try {
    recentRoutes = await fetchUserRecentRoutes();
  } catch (e) {
    // fallback
  }

  let activeFieldDevices: any[] = [];
  try {
    activeFieldDevices = await fetchActiveFieldDevices();
  } catch (e) {
    // fallback
  }

  let targetProgress = null;
  try {
    targetProgress = await fetchDashboardTargetsProgress();
  } catch (e) {
    // fallback
  }

  let territoryDistribution: any[] = [];
  try {
    territoryDistribution = await fetchExactTerritoryDistribution();
  } catch (e) {
    // fallback
  }

  let fieldActivities: any[] = [];
  try {
    fieldActivities = await fetchFieldOperationsTimeline();
  } catch (e) {
    // fallback
  }

  let weeklyProgress: any = null;
  try {
    weeklyProgress = await fetchWeeklyProgressData();
  } catch (e) {
    // fallback
  }

  let dailyPrioritiesData: { tasks: any[]; targets: any; todayShift: any } = {
    tasks: [],
    targets: { min_shift_hours: 6, target_visits: 5, target_orders: 3, target_distance_km: 15 },
    todayShift: null
  };
  try {
    dailyPrioritiesData = await fetchDailyPriorities();
  } catch (e) {
    // fallback
  }

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
