# Timetable Conflict Detection - Test Suite

## Overview
Comprehensive test suite for validating all timetable conflict detection constraints and room status monitoring.

## Test Coverage

### 1. Validation Service Tests (`validationService.test.js`)

#### Constraint 1: Room Status Validation
- ✅ Pass when room is active
- ✅ Fail when room is in maintenance (non-overridable)
- ✅ Fail when room is reserved (non-overridable)
- ✅ Fail when room is closed (non-overridable)
- ✅ Fail when room does not exist (non-overridable)

#### Constraint 2: Room Capacity Validation
- ✅ Pass when capacity is sufficient
- ✅ Fail when capacity is insufficient (overridable)
- ✅ Warn when room is oversized (>2x section size)

#### Constraint 3: Equipment Validation
- ✅ Pass when all equipment is available
- ✅ Pass when no equipment is required
- ✅ Warn when equipment is missing (overridable)

#### Constraint 4: Time Slot Availability
- ✅ Pass when time slot is available
- ✅ Fail when room is occupied at same time (overridable)
- ✅ Pass when excluding current timetable from check

#### Constraint 5: Room Type Validation
- ✅ Pass when room type matches subject requirements
- ✅ Warn when lab subject assigned to classroom (overridable)
- ✅ Warn when classroom subject assigned to lab (overridable)

#### Comprehensive Validation
- ✅ Return valid result when all constraints pass
- ✅ Return errors and allow force update for overridable constraints
- ✅ Prevent force update for non-overridable constraints

### 2. Conflict Detection Tests (`conflictDetection.test.js`)

#### Room Status Change Monitoring
- ✅ Detect conflicts when room becomes unavailable
- ✅ Not create conflict when room stays active
- ✅ Clear affected flags when room becomes active again

#### Affected Entries Identification
- ✅ Identify all affected timetable entries
- ✅ Not identify unpublished timetables
- ✅ Only identify entries for specific room

#### Mark Entries as Affected
- ✅ Mark timetable entries with affected flags
- ✅ Set originalRoomId, affectedReason, and affectedAt

#### Conflict Record Creation
- ✅ Create comprehensive conflict record
- ✅ Populate affected entries with complete details
- ✅ Update resolution summary

#### Scheduled Classes Check
- ✅ Find scheduled classes for a room
- ✅ Return empty for room with no classes

#### Unavailable Status Detection
- ✅ Detect conflict for status: in_maintenance
- ✅ Detect conflict for status: reserved
- ✅ Detect conflict for status: closed
- ✅ Detect conflict for status: offline
- ✅ Not detect conflict for active status

#### Active Conflicts Retrieval
- ✅ Retrieve all active conflicts

## Setup Instructions

### 1. Install Dependencies
```bash
cd smart/backend
npm install
```

This will install:
- jest (testing framework)
- @types/jest (TypeScript definitions)

### 2. Configure Test Database
Ensure MongoDB is running locally or update `.env.test` with your test database URI:
```
MONGODB_URI_TEST=mongodb://localhost:27017/smart-test
```

### 3. Run Tests

#### Run all tests:
```bash
npm test
```

#### Run with watch mode:
```bash
npm run test:watch
```

#### Run with coverage report:
```bash
npm run test:coverage
```

#### Run specific test suites:
```bash
npm run test:validation
npm run test:conflict
```

## Test Results Interpretation

### Success Indicators
- All tests pass (green checkmarks)
- Coverage > 80% for critical services
- No timeout errors

### Common Issues

#### MongoDB Connection Failed
- Ensure MongoDB is running: `mongod`
- Check connection string in `.env.test`

#### Timeout Errors
- Increase timeout in `jest.config.js`
- Check database performance

#### Test Data Conflicts
- Tests clean up data in `beforeEach`
- Use separate test database

## Constraint Summary

| Constraint | Type | Overridable | Severity |
|------------|------|-------------|----------|
| Room Status | Hard | No | Error |
| Room Not Found | Hard | No | Error |
| Time Slot Occupied | Soft | Yes | Error |
| Capacity Insufficient | Soft | Yes | Error |
| Equipment Missing | Soft | Yes | Warning |
| Room Type Mismatch | Soft | Yes | Warning |
| Room Oversized | Soft | Yes | Warning |

## CI/CD Integration

Add to your CI pipeline:
```yaml
- name: Run Tests
  run: |
    cd smart/backend
    npm install
    npm run test:coverage
```

## Coverage Goals
- Services: > 90%
- Controllers: > 80%
- Models: > 70%

## Maintenance
- Update tests when adding new constraints
- Review test coverage monthly
- Keep test data minimal and focused
