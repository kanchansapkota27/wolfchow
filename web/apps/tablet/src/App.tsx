import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { TabletLogin } from './pages/TabletLogin'
import { OrderQueue } from './pages/OrderQueue'
import { ActiveOrders } from './pages/ActiveOrders'
import { Inventory } from './pages/Inventory'
import { PauseControl } from './pages/PauseControl'
import { OrderHistory } from './pages/OrderHistory'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<TabletLogin />} />
      <Route element={<Layout />}>
        <Route index element={<OrderQueue />} />
        <Route path="active" element={<ActiveOrders />} />
        <Route path="history" element={<OrderHistory />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="pause" element={<PauseControl />} />
      </Route>
    </Routes>
  )
}
