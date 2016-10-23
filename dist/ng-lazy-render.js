/**
 * Module declaration
 */
angular.module('ngLazyRender', ['angular-inview']);
/**
 * Use this directive as an attribute if you want to delay the rendering of a module until visible
 * in the viewport.
 *
 * Attributes:
 * - lazyModule: templateUrl of a placeholder to render while the module is not visible or while being
 *               rendered.
 * - lazyIf: use an angular expression here to set a condition on whether you want this directive to
 *           take action or be ignored.
 *
 * Example:
 * <any lazy-module="myModulePlaceholder.html" lazy-if="ctrl.acceleratePageLoad">
 *  <!-- lots of code -->
 * </any>
 */
angular.module('ngLazyRender').directive('lazyModule', [
    '$animate',
    '$compile',
    '$parse',
    '$q',
    '$templateCache',
    'inViewDirective',
    function ($animate, $compile, $parse, $q, $templateCache, inViewDirective) {
        'use strict';

        return {
            // 500 because is less than ngIf and ngRepeat
            priority: 500,
            terminal: true,
            transclude: 'element',
            link: function ($scope, $element, $attr, ctrl, $transclude) {
                // If the expression in lazyIf is false, skip the directive's action
                if ($parse($attr.lazyIf)($scope) === false) {
                    $transclude(function (clone) {
                        $animate.enter(clone, $element.parent(), $element);
                    });
                    return;
                }

                var el = angular.element($templateCache.get($attr.lazyModule));
                var isolateScope = $scope.$new(true);

                // Callback for inViewDirective to be called when the module becomes visible.
                // This will destroy the scope of the placeholder with inView and replace it with
                // the actual transcluded content.
                isolateScope.update = function () {
                    // If the function is called after the scope is destroyed (more than once),
                    // we should do nothing.
                    if (isolateScope === null) {
                        return;
                    }
                    // It is important to destroy the old scope or we'll get unwanted calls from
                    // the inView directive.
                    isolateScope.$destroy();
                    isolateScope = null;

                    $transclude(function (clone) {
                        var enterPromise = $animate.enter(clone, $element.parent(), $element);
                        var leavePromise = $animate.leave(el);

                        $q.all([enterPromise, leavePromise]).then(function () {
                            el = null;

                            // This triggers inview again to make sure everything is checked again
                            angular.element(window).triggerHandler('checkInView');
                        });
                    });
                };

                $animate.enter(el, $element.parent(), $element).then(function () {
                    $compile(el)(isolateScope);
                    inViewDirective[0].compile()(isolateScope, el, {
                        inView: "$inview && update()"
                    });
                });
            }
        };
    }]);

/**
 * Use this directive as an attribute if you want a repeater (ng-repeat) to grow as the user scrolls down.
 * 
 * Attributes:
 * - lazyRepeater: number of initially shown items. This number is doubled every time the user sees the end of the list.
 * - lazyTemplate: template (or templateUrl) to be shown at the end of the list.
 * - lazyIf: use an angular expression here to set a condition on whether you want this directive to
 *           take action or be ignored.
 *
 * Example:
 * <ul>
 *     <li ng-repeat="obj in data track by obj.index" 
 *      lazy-repeater="10"
 *      lazy-placeholder="templateUrl"
 *      lazy-if="ctrl.acceleratePageLoad">
 *          {{obj.data}}
 *     </li>
 * </ul>
 */
angular.module('ngLazyRender').directive('lazyRepeater', [
    '$animate',
    '$compile',
    '$parse',
    '$templateCache',
    '$timeout',
    function ($animate, $compile, $parse, $templateCache, $timeout) {
        'use strict';

        return {
            restrict: 'A',
            priority: 2000,

            compile: function (tElement, tAttrs) {
                var trackByIndex = tAttrs.ngRepeat.indexOf('track by');

                if (trackByIndex === -1) {
                    tAttrs.ngRepeat += "| limitTo: getLazyLimit()";
                } else {
                    tAttrs.ngRepeat = tAttrs.ngRepeat.substr(0, trackByIndex) +
                        "| limitTo: getLazyLimit() " + tAttrs.ngRepeat.substr(trackByIndex);
                }

                var bufferProp = tAttrs.ngRepeat.match(/in (.*?)?([ |\n|]|$)/)[1];

                return function ($scope, el, attrs) {
                    var limit = attrs.lazyRepeater;
                    var placeholderVisible = false;

                    function getBufferLength() {
                        return $scope.$eval(bufferProp).length;
                    }

                    function addPlaceholder() {
                        var placeholder = attrs.lazyPlaceholder ? $templateCache.get(attrs.lazyPlaceholder) || attrs.lazyPlaceholder : '';
                        var placeholderEl = angular.element('<div in-view="$inview && increaseLimit()">' + placeholder + '</div>');
                        var isolateScope = $scope.$new(true);

                        isolateScope.increaseLimit = function () {
                            var bufferLength = getBufferLength();

                            limit *= 2;
                            
                            if (limit >= bufferLength) {
                                isolateScope.$destroy();
                                $animate.leave(placeholderEl);
                                placeholderVisible = false;
                            }
                        };

                        var elSiblings = el.parent().children();
                        var elLastSibling = elSiblings.length === 0 ? el : elSiblings.eq(-1);

                        $animate.enter(placeholderEl, el.parent(), elLastSibling).then(function () {
                            // trigger in-view for other listeners
                            angular.element(window).triggerHandler('checkInView');
                        });
                        $compile(placeholderEl)(isolateScope);
                        placeholderVisible = true;
                    }

                    // Only apply lazyRepeater if the threshold is smaller then the number of items and if the
                    // parameter lazy-if is true
                    if (limit < getBufferLength() && $parse(attrs.lazyIf)($scope) !== false) {
                        addPlaceholder();

                        $scope.getLazyLimit = function () {
                            return limit;
                        };

                        $scope.$watch(getBufferLength, function (bufferLength) {
                            if (limit < bufferLength && !placeholderVisible) {
                                addPlaceholder();
                            }
                        });
                    }
                };
            }
        };
    }]);
