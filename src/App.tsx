import { useRoute } from './lib/router';
import { Body } from './screens/Body';
import { Home } from './screens/Home';
import { Meal } from './screens/Meal';
import { Targets } from './screens/Targets';
import { ProgramEditor } from './screens/ProgramEditor';
import { Session } from './screens/Session';
import { WorkoutHub } from './screens/WorkoutHub';
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
      return <Meal />;
    case 'targets':
      return <Targets />;
    case 'workout':
      return <WorkoutHub />;
    case 'session':
      return <Session />;
    case 'program':
      return <ProgramEditor />;
    default:
      return <Home />;
  }
}
