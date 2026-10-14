import { Request, Response, NextFunction } from 'express';

export const requireRole = (roleCode: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'User is not authenticated.' }
      });
      return;
    }

    if (!req.user.roles.includes(roleCode) && !req.user.roles.includes('system_admin')) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_ROLE',
          message: `Access denied. Role '${roleCode}' is required.`
        }
      });
      return;
    }

    next();
  };
};

export const requirePermission = (permissionCode: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'User is not authenticated.' }
      });
      return;
    }

    if (!req.user.permissions.includes(permissionCode) && !req.user.roles.includes('system_admin')) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_PERMISSION',
          message: `Access denied. Permission '${permissionCode}' is required.`
        }
      });
      return;
    }

    next();
  };
};

export const requireTeacher = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'User is not authenticated.' }
    });
    return;
  }

  const isTeacher = req.user.roles.includes('teacher');
  const isAdmin = req.user.roles.includes('system_admin') || req.user.roles.includes('principal');

  if (!isTeacher && !isAdmin) {
    res.status(403).json({
      error: {
        code: 'NOT_TEACHER_ROLE',
        message: 'Access restricted to teaching faculty.'
      }
    });
    return;
  }

  if (isTeacher && !req.user.staffId) {
    res.status(403).json({
      error: {
        code: 'NO_STAFF_PROFILE',
        message: 'Teacher account is not linked to an active staff record.'
      }
    });
    return;
  }

  next();
};
