import type { AppUser } from '../../types'

interface Props { appUser: AppUser }

export default function StudentAccommodation({ appUser: _ }: Props) {
  return (
    <div className="p-8 max-w-2xl">
      <div className="text-xl font-bold text-navy-900 mb-2">Accommodation</div>
      <div className="text-sm text-gray-400 mb-8">Hostel & room allocation</div>
      <div className="rounded-lg border-2 border-dashed border-gray-200 py-20 text-center">

        <div className="text-sm font-semibold text-gray-500">Coming soon</div>
        <div className="text-xs text-gray-400 mt-1">Hostel booking and room allocation will be available here.</div>
      </div>
    </div>
  )
}
