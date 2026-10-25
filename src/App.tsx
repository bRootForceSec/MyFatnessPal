import { useRoute } from './lib/router';
import { Body } from './screens/Body';
import { ComingSoon } from './screens/ComingSoon';
import { Home } from './screens/Home';
import { Settings } from './screens/Settings';
import { Sleep } from './screens/Sleep';

export function App() {
  const route = useRoute();
  switch (route) {
    case 'sleep':
      return <Sleep />;
    case 'body':
      return <Body />;
    case 'settings':
      return <Settings />;
    case 'meal':
      return <ComingSoon title="Meal" step={3} />;
    case 'workout':
      return <ComingSoon title="Workout" step={2} />;
    default:
      return <Home />;
  }
}
