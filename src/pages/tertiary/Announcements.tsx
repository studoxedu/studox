import { Topbar } from '../../components/layout/Topbar'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

export default function TertiaryAnnouncements({ appUser: _ }: Props) {
  return (
    <>
      <Topbar
        title="Announcements"
        meta="Institution-wide notices"
        actions={<Button variant="primary" size="sm">+ Post Announcement</Button>}
      />
      <div className="p-8 max-w-2xl">
        <Card className="p-8 text-center">
          <div className="text-sm text-gray-400">No announcements yet.</div>
          <div className="text-xs text-gray-300 mt-1">Post notices visible to all members of this institution.</div>
          <div className="mt-4">
            <Button variant="primary" size="sm">Post First Announcement</Button>
          </div>
        </Card>
      </div>
    </>
  )
}
