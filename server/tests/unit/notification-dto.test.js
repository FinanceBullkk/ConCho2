const { toFeedItem } = require('../../domains/notification/dto');

describe('English Meeting notification presenters', () => {
  test.each([
    ['english_session_scheduled', 'English session scheduled'],
    ['english_session_rescheduled', 'English session rescheduled'],
    ['english_session_cancelled', 'English session cancelled'],
  ])('%s has a useful learner-facing title', (type, title) => {
    const item = toFeedItem({
      _id: `${type}-1`, type, createdAt: new Date(),
      metadata: {
        className: 'EL001 — Foundation', sessionNumber: 3,
        sessionDate: '2099-07-22T02:00:00.000Z',
      },
    });
    expect(item).toMatchObject({ title, link: '/home', isRead: false });
    expect(item.body).toContain('EL001');
  });
});
