from app.hms.schemas import (
    HotelRateMatrixRead,
    HotelRateMatrixUpdate,
    HotelRatePlanCreate,
    HotelRatePlanRead,
    HotelRateSeasonCreate,
    HotelRateSeasonRead,
)


class PmsRateSeasonCreate(HotelRateSeasonCreate):
    pass


class PmsRateSeasonRead(HotelRateSeasonRead):
    pass


class PmsRatePlanCreate(HotelRatePlanCreate):
    pass


class PmsRatePlanRead(HotelRatePlanRead):
    pass


class PmsRateMatrixRead(HotelRateMatrixRead):
    pass


class PmsRateMatrixUpdate(HotelRateMatrixUpdate):
    pass
