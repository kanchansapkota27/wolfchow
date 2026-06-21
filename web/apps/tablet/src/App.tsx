import { Route, Routes } from 'react-router'
import { LoginPage } from '@wolfchow/auth'
import { Layout } from './components/Layout'
import { OrderQueue } from './pages/OrderQueue'
import { ActiveOrders } from './pages/ActiveOrders'
import { Inventory } from './pages/Inventory'
import { PauseControl } from './pages/PauseControl'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage methods={['staff', 'device']} />} />
      <Route element={<Layout />}>
        <Route index element={<OrderQueue />} />
        <Route path="active" element={<ActiveOrders />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="pause" element={<PauseControl />} />
      </Route>
    </Routes>
  )
}
