import { AdminApp } from './admin/AdminApp.tsx';
import { Desktop } from './components/Desktop.tsx';
import { CatalogProvider } from './hooks/useCatalog.tsx';
import { useRoute } from './hooks/useRoute.ts';
import { useNotice } from './hooks/useNotice.ts';
import { PlaybackProvider } from './hooks/usePlayback.tsx';
import './styles/admin.css';

const App = () => {
  const notice = useNotice();
  const route = useRoute();
  return (
    <CatalogProvider>
      <PlaybackProvider notify={notice.show}>
        {route.view === 'admin'
          ? <AdminApp />
          : <Desktop notice={notice.message} notify={notice.show} />}
      </PlaybackProvider>
    </CatalogProvider>
  );
};

export default App;
