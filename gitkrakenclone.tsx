import React, { useState, useMemo } from 'react';
import { 
  GitBranch, 
  GitCommit, 
  Tag, 
  ChevronDown, 
  ChevronRight, 
  Download, 
  Upload, 
  RefreshCw, 
  TerminalSquare,
  User,
  Clock,
  Hash,
  FileText,
  Copy,
  CheckCircle2,
  X
} from 'lucide-react';

// --- MOCK DATA ---
// Topologically sorted list of commits (newest first).
// 'track' defines the column the branch is drawn in.
const mockCommits = [
  { id: 'a1b2c3d', message: 'Merge pull request #42 from feature-auth', author: 'Alice Smith', date: '10 mins ago', branch: 'main', track: 0, parents: ['f9e8d7c', 'b3c4d5e'] },
  { id: 'f9e8d7c', message: 'Update dependencies and audit', author: 'Bob Jones', date: '1 hour ago', branch: 'main', track: 0, parents: ['e5f6g7h'] },
  { id: 'b3c4d5e', message: 'Implement JWT validation logic', author: 'Alice Smith', date: '2 hours ago', branch: 'feature-auth', track: 1, parents: ['d1e2f3g'] },
  { id: 'd1e2f3g', message: 'Setup authentication boilerplate', author: 'Alice Smith', date: '3 hours ago', branch: 'feature-auth', track: 1, parents: ['e5f6g7h'] },
  { id: 'e5f6g7h', message: 'Merge branch hotfix-db into main', author: 'Charlie Brown', date: '1 day ago', branch: 'main', track: 0, parents: ['h8i9j0k', 'g7h8i9j'] },
  { id: 'h8i9j0k', message: 'Refactor user service endpoints', author: 'Bob Jones', date: '1 day ago', branch: 'main', track: 0, parents: ['j0k1l2m'] },
  { id: 'g7h8i9j', message: 'Fix connection pooling exhaustion', author: 'Charlie Brown', date: '1 day ago', branch: 'hotfix-db', track: 2, parents: ['j0k1l2m'] },
  { id: 'j0k1l2m', message: 'Release v1.2.0 production', author: 'Alice Smith', date: '2 days ago', branch: 'main', track: 0, tags: ['v1.2.0'], parents: ['m3n4o5p'] },
  { id: 'm3n4o5p', message: 'Merge feature-ui to main', author: 'David Lee', date: '3 days ago', branch: 'main', track: 0, parents: ['p6q7r8s', 'o5p6q7r'] },
  { id: 'p6q7r8s', message: 'Prepare release notes for v1.2', author: 'Alice Smith', date: '3 days ago', branch: 'main', track: 0, parents: ['s9t0u1v'] },
  { id: 'o5p6q7r', message: 'Redesign main navigation bar', author: 'David Lee', date: '4 days ago', branch: 'feature-ui', track: 3, parents: ['s9t0u1v'] },
  { id: 's9t0u1v', message: 'Initial stable release', author: 'Alice Smith', date: '1 week ago', branch: 'main', track: 0, tags: ['v1.0.0', 'stable'], parents: [] }
];

const branches = [
  { name: 'main', track: 0 },
  { name: 'feature-auth', track: 1 },
  { name: 'hotfix-db', track: 2 },
  { name: 'feature-ui', track: 3 },
];

const trackColors = {
  0: '#38bdf8', // sky-400 (main)
  1: '#c084fc', // purple-400 (feature-auth)
  2: '#fb923c', // orange-400 (hotfix-db)
  3: '#34d399', // emerald-400 (feature-ui)
};

// --- HELPER COMPONENTS ---

const Avatar = ({ name }) => {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
  // Simple hash for pseudo-random consistent colors
  const colorIndex = name.length % 4;
  const bgColors = ['bg-blue-600', 'bg-rose-600', 'bg-emerald-600', 'bg-amber-600'];
  
  return (
    <div className={`w-8 h-8 rounded-full ${bgColors[colorIndex]} flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-slate-800`}>
      {initials}
    </div>
  );
};

export default function App() {
  const [selectedCommitId, setSelectedCommitId] = useState(mockCommits[0].id);
  const [sidebarSections, setSidebarSections] = useState({ local: true, remote: true, tags: true });

  const toggleSection = (section) => {
    setSidebarSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Derived state
  const selectedCommit = useMemo(() => mockCommits.find(c => c.id === selectedCommitId), [selectedCommitId]);

  // Graph rendering constants
  const rowHeight = 44;
  const colWidth = 24;
  const offsetX = 30;
  const offsetY = rowHeight / 2;

  // Compute graph paths
  const paths = useMemo(() => {
    const lines = [];
    mockCommits.forEach((commit, i) => {
      const x1 = commit.track * colWidth + offsetX;
      const y1 = i * rowHeight + offsetY;

      commit.parents.forEach(parentId => {
        const parentIndex = mockCommits.findIndex(c => c.id === parentId);
        if (parentIndex !== -1) {
          const parentCommit = mockCommits[parentIndex];
          const x2 = parentCommit.track * colWidth + offsetX;
          const y2 = parentIndex * rowHeight + offsetY;
          
          // Color based on whichever branch is NOT main, or just child branch
          const strokeColor = commit.track === 0 && parentCommit.track !== 0 
            ? trackColors[parentCommit.track] 
            : trackColors[commit.track];

          // Draw bezier curve for smooth branching/merging
          const pathData = `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
          
          lines.push({
            id: `${commit.id}-${parentId}`,
            d: pathData,
            color: strokeColor
          });
        }
      });
    });
    return lines;
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#0f111a] text-slate-300 font-sans overflow-hidden selection:bg-sky-500/30">
      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-[#151822] border-r border-slate-800/60 flex flex-col shadow-xl z-20">
        <div className="h-14 flex items-center px-4 font-semibold text-slate-100 border-b border-slate-800/60 bg-[#1a1d27]">
          <TerminalSquare className="w-5 h-5 mr-3 text-sky-400" />
          AcmeProject
        </div>
        
        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
          {/* Local Branches */}
          <div className="mb-2">
            <button 
              onClick={() => toggleSection('local')}
              className="w-full flex items-center px-2 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors"
            >
              {sidebarSections.local ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
              Local ({branches.length})
            </button>
            {sidebarSections.local && (
              <ul className="mt-1 space-y-0.5">
                {branches.map(branch => (
                  <li key={branch.name} className="px-3">
                    <div className="flex items-center px-2 py-1.5 rounded-md hover:bg-slate-800/50 cursor-pointer text-sm group">
                      <GitBranch className="w-4 h-4 mr-2" style={{ color: trackColors[branch.track] }} />
                      <span className="truncate group-hover:text-slate-100 transition-colors">{branch.name}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Tags */}
          <div className="mb-2">
            <button 
              onClick={() => toggleSection('tags')}
              className="w-full flex items-center px-2 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors"
            >
              {sidebarSections.tags ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
              Tags (2)
            </button>
            {sidebarSections.tags && (
              <ul className="mt-1 space-y-0.5">
                {['v1.2.0', 'v1.0.0'].map(tag => (
                  <li key={tag} className="px-3">
                    <div className="flex items-center px-2 py-1.5 rounded-md hover:bg-slate-800/50 cursor-pointer text-sm group">
                      <Tag className="w-4 h-4 mr-2 text-emerald-500" />
                      <span className="truncate group-hover:text-slate-100 transition-colors">{tag}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* TOP TOOLBAR */}
        <header className="h-14 bg-[#1a1d27] border-b border-slate-800/60 flex items-center justify-between px-4 z-20 shadow-sm">
          <div className="flex space-x-2">
            <button className="flex items-center px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 text-sm font-medium rounded-md border border-slate-700/50 transition-colors">
              <Download className="w-4 h-4 mr-2 text-sky-400" />
              Pull
            </button>
            <button className="flex items-center px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 text-sm font-medium rounded-md border border-slate-700/50 transition-colors">
              <Upload className="w-4 h-4 mr-2 text-emerald-400" />
              Push
            </button>
            <div className="w-px h-6 bg-slate-800 mx-2 self-center"></div>
            <button className="flex items-center px-3 py-1.5 hover:bg-slate-800/50 text-sm font-medium rounded-md transition-colors text-slate-400 hover:text-slate-200">
              <RefreshCw className="w-4 h-4 mr-2" />
              Fetch All
            </button>
          </div>
          
          <div className="flex items-center text-sm">
            <span className="text-slate-500 mr-2">Current Branch:</span>
            <span className="font-semibold text-sky-400 bg-sky-900/20 px-2 py-1 rounded-md border border-sky-800/30 flex items-center">
              <GitBranch className="w-4 h-4 mr-1.5" />
              main
            </span>
          </div>
        </header>

        {/* GRAPH & LIST AREA */}
        <div className="flex-1 overflow-auto relative custom-scrollbar flex">
          
          <div className="flex-1 relative min-w-max">
            {/* SVG GRAPH LAYER - Absolute positioned over the rows, pointer events disabled to let clicks pass through to rows */}
            <svg 
              className="absolute top-0 left-0 w-[180px] h-full pointer-events-none z-10"
              style={{ height: `${mockCommits.length * rowHeight}px` }}
            >
              {/* Draw connections (paths) */}
              {paths.map(path => (
                <path
                  key={path.id}
                  d={path.d}
                  fill="none"
                  stroke={path.color}
                  strokeWidth="2.5"
                  className="opacity-80"
                />
              ))}

              {/* Draw commits (nodes) */}
              {mockCommits.map((commit, i) => {
                const cx = commit.track * colWidth + offsetX;
                const cy = i * rowHeight + offsetY;
                const isSelected = selectedCommitId === commit.id;
                
                return (
                  <g key={`node-${commit.id}`} className="transition-transform duration-200">
                    {isSelected && (
                      <circle 
                        cx={cx} cy={cy} r="10" 
                        fill="none" 
                        stroke={trackColors[commit.track]} 
                        strokeWidth="1.5" 
                        opacity="0.5" 
                        className="animate-pulse"
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r="6"
                      fill={trackColors[commit.track]}
                      stroke="#0f111a"
                      strokeWidth="2.5"
                    />
                    {/* Inner dot for merge commits */}
                    {commit.parents.length > 1 && (
                      <circle cx={cx} cy={cy} r="2" fill="#0f111a" />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* LIST ROWS LAYER */}
            <div className="w-full relative z-0">
              {/* Header row */}
              <div className="sticky top-0 bg-[#0f111a]/95 backdrop-blur-sm border-b border-slate-800/80 h-8 flex items-center text-xs font-semibold text-slate-500 uppercase tracking-wide z-20">
                <div className="w-[180px] shrink-0 pl-6">Graph</div>
                <div className="flex-1 min-w-[300px]">Description</div>
                <div className="w-40 shrink-0">Commit</div>
                <div className="w-48 shrink-0">Author</div>
                <div className="w-32 shrink-0">Date</div>
              </div>

              {/* Data rows */}
              {mockCommits.map((commit, i) => {
                const isSelected = selectedCommitId === commit.id;
                return (
                  <div 
                    key={commit.id}
                    onClick={() => setSelectedCommitId(commit.id)}
                    className={`
                      flex items-center w-full border-b border-slate-800/30 cursor-pointer transition-colors
                      ${isSelected ? 'bg-sky-900/20' : 'hover:bg-slate-800/40'}
                    `}
                    style={{ height: `${rowHeight}px` }}
                  >
                    {/* Graph Spacer */}
                    <div className="w-[180px] shrink-0 h-full"></div>
                    
                    {/* Description */}
                    <div className="flex-1 flex items-center min-w-[300px] pr-4 h-full">
                      {/* Tags/Badges */}
                      <div className="flex items-center space-x-1.5 mr-3 shrink-0">
                        {/* Branch badge if it's the latest on this branch (simulated) */}
                        {i === mockCommits.findIndex(c => c.branch === commit.branch) && (
                          <span 
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide flex items-center"
                            style={{ backgroundColor: `${trackColors[commit.track]}20`, color: trackColors[commit.track], border: `1px solid ${trackColors[commit.track]}40` }}
                          >
                            {commit.branch}
                          </span>
                        )}
                        {/* Custom Tags */}
                        {commit.tags?.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-bold flex items-center">
                            <Tag className="w-2.5 h-2.5 mr-1" />
                            {tag}
                          </span>
                        ))}
                      </div>
                      
                      <span className={`truncate text-sm ${isSelected ? 'text-white font-medium' : 'text-slate-300'}`}>
                        {commit.message}
                      </span>
                    </div>

                    {/* Commit Hash */}
                    <div className="w-40 shrink-0 text-sm font-mono text-slate-500 flex items-center">
                      {commit.id}
                    </div>

                    {/* Author */}
                    <div className="w-48 shrink-0 flex items-center text-sm text-slate-400">
                      <div className="w-5 h-5 rounded-full bg-slate-700 mr-2 flex items-center justify-center text-[9px] font-bold text-slate-300">
                        {commit.author.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="truncate">{commit.author}</span>
                    </div>

                    {/* Date */}
                    <div className="w-32 shrink-0 text-sm text-slate-500 pr-4">
                      {commit.date}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* RIGHT SIDEBAR - COMMIT DETAILS */}
      {selectedCommit && (
        <aside className="w-80 bg-[#151822] border-l border-slate-800/60 flex flex-col shadow-xl z-20">
          <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800/60 bg-[#1a1d27]">
            <h2 className="font-semibold text-slate-100 flex items-center">
              <GitCommit className="w-4 h-4 mr-2 text-slate-400" />
              Commit Details
            </h2>
            <button 
              onClick={() => setSelectedCommitId(null)}
              className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            
            {/* Header / ID */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                <Hash className="w-4 h-4 text-slate-500" />
                <span className="font-mono text-lg font-bold text-sky-400">{selectedCommit.id}</span>
              </div>
              <button className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-md transition-colors" title="Copy SHA">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Author Info */}
            <div className="flex items-center mb-6 p-3 bg-slate-800/30 rounded-lg border border-slate-700/40">
              <Avatar name={selectedCommit.author} />
              <div className="ml-3">
                <div className="text-sm font-medium text-slate-200">{selectedCommit.author}</div>
                <div className="text-xs text-slate-500 flex items-center mt-0.5">
                  <Clock className="w-3 h-3 mr-1" />
                  {selectedCommit.date}
                </div>
              </div>
            </div>

            {/* Message */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center">
                <FileText className="w-3.5 h-3.5 mr-1.5" /> Message
              </h3>
              <p className="text-sm text-slate-200 leading-relaxed bg-[#0f111a] p-3 rounded-lg border border-slate-800">
                {selectedCommit.message}
                <br/><br/>
                <span className="text-slate-500 text-xs">No extended description provided for this commit.</span>
              </p>
            </div>

            {/* Branch & Parents */}
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Branch</h3>
                <div 
                  className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium border"
                  style={{ 
                    backgroundColor: `${trackColors[selectedCommit.track]}15`, 
                    color: trackColors[selectedCommit.track],
                    borderColor: `${trackColors[selectedCommit.track]}30` 
                  }}
                >
                  <GitBranch className="w-3.5 h-3.5 mr-1.5" />
                  {selectedCommit.branch}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Parents</h3>
                {selectedCommit.parents.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedCommit.parents.map(p => (
                      <span key={p} className="font-mono text-xs text-slate-400 bg-slate-800/80 px-2 py-1 rounded border border-slate-700 hover:text-sky-400 hover:border-sky-500/50 cursor-pointer transition-colors">
                        {p}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-slate-600 italic">Initial commit (No parents)</span>
                )}
              </div>
            </div>
            
            {/* Status Checks Mock */}
            <div className="mt-8 pt-6 border-t border-slate-800/80">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Status Checks</h3>
              <div className="flex items-center text-sm text-slate-300 bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mr-2" />
                <span>3/3 successful checks</span>
              </div>
            </div>

          </div>
        </aside>
      )}

      {/* Global styles for custom scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}} />
    </div>
  );
}