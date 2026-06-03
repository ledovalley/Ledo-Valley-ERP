const fs = require('fs');

let page = fs.readFileSync('src/app/page.tsx', 'utf8');

// 1. Add Loading Hints and State
if (!page.includes('const loadingHints =')) {
  page = page.replace(
    'const [isDataLoaded, setIsDataLoaded] = useState(!auth);',
    'const [isDataLoaded, setIsDataLoaded] = useState(!auth);\n  const [loadingHintIndex, setLoadingHintIndex] = useState(0);\n  const loadingHints = [\n    "Connecting to Backend Service...",\n    "Initializing Ledo Valley ERP...",\n    "Loading Warehouse Catalogs...",\n    "Verifying Access Protocols..."\n  ];\n\n  useEffect(() => {\n    if (isDataLoaded) return;\n    const interval = setInterval(() => {\n      setLoadingHintIndex((prev) => (prev + 1) % loadingHints.length);\n    }, 2500);\n    return () => clearInterval(interval);\n  }, [isDataLoaded]);'
  );
}

// 2. Update Loading Screen UI
page = page.replace(
  '<h2 className="text-2xl font-bold text-slate-800 tracking-tight">Syncing Ledo Valley Pro...</h2>\n        <p className="text-sm text-slate-500 mt-2 font-medium">Connecting to secure cloud warehouse database</p>',
  '<h2 className="text-2xl font-black text-slate-800 tracking-tight">Ledo Valley ERP System</h2>\n        <p className="text-sm text-slate-500 mt-3 font-semibold h-5 animate-fade-in transition-all">{loadingHints[loadingHintIndex]}</p>'
);

// 3. Clean up Sidebar
page = page.replace(
  '<p className="text-[10px] text-emerald-400/80 mt-1.5 flex items-center gap-1.5 uppercase font-black tracking-[0.15em] bg-emerald-950/40 w-fit px-2 py-0.5 rounded-full border border-emerald-800/30">\n              <Cloud size={10} className="animate-pulse" /> Live Cloud Sync\n            </p>',
  '<p className="text-[10px] text-emerald-500/90 mt-1.5 uppercase font-black tracking-[0.2em]">Enterprise Resource Planning</p>'
);

// 4. Add Topbar & Fix main wrapper layout
// Currently:
// </nav>
//
// <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen">

const currentNavEnd = '</nav>\n\n        <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen">';
const newNavEnd = `</nav>

        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50">
          {/* Persistent Topbar */}
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-sm hidden md:flex">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-slate-800 capitalize tracking-tight">
                {navItems.find(n => n.id === activeTab)?.label}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-bold text-slate-600 tracking-wide uppercase">Backend Connected</span>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-8 overflow-y-auto">`;

if (page.includes(currentNavEnd)) {
  page = page.replace(currentNavEnd, newNavEnd);
  
  // Close the new wrapper div at the end of the file
  page = page.replace('</main>\n      </div>\n    </>\n  );\n}', '</main>\n        </div>\n      </div>\n    </>\n  );\n}');
}

// 5. Remove duplicated Mobile Header
// Mobile header is right before <nav>
// Let's also add module title to mobile header
page = page.replace(
  '<h1 className="text-xl font-bold text-emerald-400">Ledo Valley Pro</h1>',
  '<h1 className="text-xl font-bold text-emerald-400">Ledo Valley ERP</h1>'
);

fs.writeFileSync('src/app/page.tsx', page);
console.log("Updated page.tsx completely");
